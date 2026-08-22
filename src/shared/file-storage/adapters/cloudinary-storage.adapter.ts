import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import type { ApplicationConfiguration } from '../../../config/configuration.js';
import type {
  FileStorageAdapter,
  StorageDownload,
  StorageUploadInput,
  StoredFile,
} from '../file-storage.interface.js';

@Injectable()
export class CloudinaryStorageAdapter implements FileStorageAdapter {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly folder: string;

  constructor(
    private readonly configService: ConfigService<
      ApplicationConfiguration,
      true
    >,
  ) {
    const config = this.configService.get('fileStorage', { infer: true });

    this.cloudName = config.cloudinaryCloudName;
    this.apiKey = config.cloudinaryApiKey;
    this.apiSecret = config.cloudinaryApiSecret;
    this.folder = config.cloudinaryFolder;

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  async upload(input: StorageUploadInput): Promise<StoredFile> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${this.folder}/${input.folder}`,
          resource_type: 'auto',
          type: 'authenticated',
          use_filename: false,
          unique_filename: true,
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(
              error instanceof Error
                ? error
                : new Error('Cloudinary upload failed.'),
            );
            return;
          }

          resolve(uploaded);
        },
      );

      Readable.from(input.file.buffer).pipe(stream);
    });

    const assetId: unknown = result.asset_id;

    if (typeof assetId !== 'string' || assetId.length === 0) {
      throw new Error('Cloudinary upload did not return an asset ID.');
    }

    return {
      storageKey: assetId,
    };
  }

  async destroy(storageKey: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signCloudinaryParams(
      { asset_id: storageKey, timestamp },
      this.apiSecret,
    );
    const body = new URLSearchParams({
      asset_id: storageKey,
      api_key: this.apiKey,
      timestamp,
      signature,
    });

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/asset/destroy`,
      {
        method: 'POST',
        body,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Cloudinary asset destroy failed with ${response.status}.`,
      );
    }
  }

  async download(storageKey: string): Promise<StorageDownload> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signCloudinaryParams(
      { asset_id: storageKey, timestamp },
      this.apiSecret,
    );
    const parameters = new URLSearchParams({
      asset_id: storageKey,
      api_key: this.apiKey,
      timestamp,
      signature,
    });

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/asset/download?${parameters.toString()}`,
    );

    if (!response.ok || !response.body) {
      throw new Error(
        `Cloudinary asset download failed with ${response.status}.`,
      );
    }

    return {
      stream: Readable.fromWeb(response.body as unknown as NodeReadableStream),
    };
  }
}

function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}
