CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('DRAFT', 'PENDING', 'REJECTED', 'POSTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PM', 'CM', 'OM', 'FM', 'ADMIN');--> statement-breakpoint
CREATE TABLE "bill_allocations" (
	"bill_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"pm_id" uuid,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "bill_allocations_bill_id_position_pk" PRIMARY KEY("bill_id","position")
);
--> statement-breakpoint
CREATE TABLE "bill_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bill_id" uuid NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"by_id" uuid,
	"role" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_line_items" (
	"bill_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quantity" numeric(14, 4) DEFAULT 1 NOT NULL,
	"rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"account_id" text DEFAULT '' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"tax_percentage" numeric(14, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "bill_line_items_bill_id_position_pk" PRIMARY KEY("bill_id","position")
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_org_id" uuid NOT NULL,
	"file_id" uuid,
	"file_type" text DEFAULT 'application/pdf' NOT NULL,
	"extracted" jsonb,
	"vendor_id" text DEFAULT '' NOT NULL,
	"vendor_name" text DEFAULT '' NOT NULL,
	"bill_number" text DEFAULT '' NOT NULL,
	"bill_date" date,
	"due_date" date,
	"discount_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"discount_percent" numeric(14, 4) DEFAULT 0 NOT NULL,
	"location_id" text DEFAULT '' NOT NULL,
	"location_name" text DEFAULT '' NOT NULL,
	"source_of_supply" text DEFAULT '' NOT NULL,
	"status" "bill_status" DEFAULT 'DRAFT' NOT NULL,
	"stage" text DEFAULT '' NOT NULL,
	"first_stage" text DEFAULT '' NOT NULL,
	"approver_id" uuid,
	"created_by" uuid,
	"owner_id" uuid,
	"vendor_gstin" text DEFAULT '' NOT NULL,
	"zoho_bill_id" text,
	"zoho_error" text,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_stage_check" CHECK ("bills"."stage" in ('', 'CM', 'OM', 'FM'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"finance_org_id" uuid NOT NULL,
	"contact_id" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"gst_no" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"last_modified_time" text DEFAULT '' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_finance_org_id_contact_id_pk" PRIMARY KEY("finance_org_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "extraction_cache" (
	"hash" text PRIMARY KEY NOT NULL,
	"invoice_key" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_org_id" uuid NOT NULL,
	"file_id" text NOT NULL,
	"vendor_gstin" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"ocr_text" text DEFAULT '' NOT NULL,
	"ai_output" jsonb,
	"final_output" jsonb,
	"corrections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"has_corrections" boolean DEFAULT false NOT NULL,
	"submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "finance_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zoho_client_id" text NOT NULL,
	"zoho_client_secret" text NOT NULL,
	"zoho_refresh_token" text NOT NULL,
	"zoho_org_id" text NOT NULL,
	"zoho_accounts_url" text DEFAULT 'https://accounts.zoho.in' NOT NULL,
	"zoho_api_url" text DEFAULT 'https://www.zohoapis.in' NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_orgs_zoho_org_id_unique" UNIQUE("zoho_org_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_org_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"manager_id" uuid,
	"location_id" text DEFAULT '' NOT NULL,
	"location_name" text DEFAULT '' NOT NULL,
	"source_of_supply" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_account_maps" (
	"user_id" uuid NOT NULL,
	"vendor_id" text NOT NULL,
	"account_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_account_maps_user_id_vendor_id_pk" PRIMARY KEY("user_id","vendor_id")
);
--> statement-breakpoint
ALTER TABLE "bill_allocations" ADD CONSTRAINT "bill_allocations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_allocations" ADD CONSTRAINT "bill_allocations_pm_id_users_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_history" ADD CONSTRAINT "bill_history_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_history" ADD CONSTRAINT "bill_history_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_finance_org_id_finance_orgs_id_fk" FOREIGN KEY ("finance_org_id") REFERENCES "public"."finance_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_finance_org_id_finance_orgs_id_fk" FOREIGN KEY ("finance_org_id") REFERENCES "public"."finance_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_logs" ADD CONSTRAINT "extraction_logs_finance_org_id_finance_orgs_id_fk" FOREIGN KEY ("finance_org_id") REFERENCES "public"."finance_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_finance_org_id_finance_orgs_id_fk" FOREIGN KEY ("finance_org_id") REFERENCES "public"."finance_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_account_maps" ADD CONSTRAINT "vendor_account_maps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_allocations_pm_idx" ON "bill_allocations" USING btree ("pm_id");--> statement-breakpoint
CREATE INDEX "bill_history_bill_idx" ON "bill_history" USING btree ("bill_id","at");--> statement-breakpoint
CREATE INDEX "bill_history_by_idx" ON "bill_history" USING btree ("by_id");--> statement-breakpoint
CREATE INDEX "bills_org_status_date_idx" ON "bills" USING btree ("finance_org_id","status","bill_date");--> statement-breakpoint
CREATE INDEX "bills_org_updated_idx" ON "bills" USING btree ("finance_org_id","updated_at");--> statement-breakpoint
CREATE INDEX "bills_owner_idx" ON "bills" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bills_approver_idx" ON "bills" USING btree ("approver_id","status");--> statement-breakpoint
CREATE INDEX "bills_vendor_number_idx" ON "bills" USING btree ("finance_org_id","vendor_id","bill_number");--> statement-breakpoint
CREATE INDEX "bills_file_idx" ON "bills" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "bills_number_trgm_idx" ON "bills" USING gin ("bill_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "bills_vendor_trgm_idx" ON "bills" USING gin ("vendor_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contacts_name_trgm_idx" ON "contacts" USING gin ("contact_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "extraction_cache_invoice_idx" ON "extraction_cache" USING btree ("invoice_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_logs_org_file_unique" ON "extraction_logs" USING btree ("finance_org_id","file_id");--> statement-breakpoint
CREATE INDEX "extraction_logs_org_submitted_idx" ON "extraction_logs" USING btree ("finance_org_id","submitted","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("finance_org_id");--> statement-breakpoint
CREATE INDEX "users_manager_idx" ON "users" USING btree ("manager_id");