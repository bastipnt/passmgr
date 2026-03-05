ALTER TABLE "items" ADD COLUMN "rowId" varchar;--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_pkey";--> statement-breakpoint
ALTER TABLE "items" ADD PRIMARY KEY ("rowId");--> statement-breakpoint
CREATE INDEX "items_item_id_idx" ON "items" ("itemId");--> statement-breakpoint
CREATE UNIQUE INDEX "items_item_id_version_idx" ON "items" ("itemId","version");