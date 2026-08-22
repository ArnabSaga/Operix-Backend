ALTER TABLE "inventory_item"
ADD CONSTRAINT "inventory_item_quantity_non_negative_check"
CHECK ("quantity" >= 0);

ALTER TABLE "inventory_transaction"
ADD CONSTRAINT "inventory_transaction_quantity_positive_check"
CHECK ("quantity" > 0);

ALTER TABLE "inventory_assignment"
ADD CONSTRAINT "inventory_assignment_quantity_positive_check"
CHECK ("quantity" > 0);

ALTER TABLE "inventory_assignment"
ADD CONSTRAINT "inventory_assignment_returned_quantity_bounds_check"
CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");
