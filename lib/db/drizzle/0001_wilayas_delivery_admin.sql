CREATE TYPE "public"."admin_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."delivery_type" AS ENUM('home', 'desk');--> statement-breakpoint
CREATE TYPE "public"."wilaya_verification" AS ENUM('established', 'press_reported', 'verified');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" integer,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "admin_role" DEFAULT 'staff' NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_lowercase" CHECK ("admin_users"."email" = lower("admin_users"."email"))
);
--> statement-breakpoint
CREATE TABLE "delivery_rates" (
	"wilaya_id" integer PRIMARY KEY NOT NULL,
	"home_available" boolean DEFAULT false NOT NULL,
	"home_fee_dzd" integer,
	"desk_available" boolean DEFAULT false NOT NULL,
	"desk_fee_dzd" integer,
	"min_days" integer,
	"max_days" integer,
	"note" text,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_rates_home_fee_valid" CHECK ("delivery_rates"."home_fee_dzd" is null or "delivery_rates"."home_fee_dzd" >= 0),
	CONSTRAINT "delivery_rates_desk_fee_valid" CHECK ("delivery_rates"."desk_fee_dzd" is null or "delivery_rates"."desk_fee_dzd" >= 0),
	CONSTRAINT "delivery_rates_home_needs_fee" CHECK (not "delivery_rates"."home_available" or "delivery_rates"."home_fee_dzd" is not null),
	CONSTRAINT "delivery_rates_desk_needs_fee" CHECK (not "delivery_rates"."desk_available" or "delivery_rates"."desk_fee_dzd" is not null),
	CONSTRAINT "delivery_rates_days_valid" CHECK (("delivery_rates"."min_days" is null or "delivery_rates"."min_days" >= 0) and ("delivery_rates"."max_days" is null or "delivery_rates"."max_days" >= 0) and ("delivery_rates"."min_days" is null or "delivery_rates"."max_days" is null or "delivery_rates"."min_days" <= "delivery_rates"."max_days"))
);
--> statement-breakpoint
CREATE TABLE "wilayas" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" integer,
	"name_fr" text NOT NULL,
	"name_ar" text NOT NULL,
	"parent_wilaya_id" integer,
	"effective_from" date,
	"verification" "wilaya_verification" NOT NULL,
	"source_reference" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wilayas_code_positive" CHECK ("wilayas"."code" is null or "wilayas"."code" > 0),
	CONSTRAINT "wilayas_not_own_parent" CHECK ("wilayas"."parent_wilaya_id" <> "wilayas"."id"),
	CONSTRAINT "wilayas_verified_has_evidence" CHECK ("wilayas"."verification" <> 'verified' or ("wilayas"."verified_at" is not null and "wilayas"."verified_by_admin_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_wilaya_code_range";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wilaya_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wilaya_name_ar" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_type" "delivery_type";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_rate_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_rates" ADD CONSTRAINT "delivery_rates_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_rates" ADD CONSTRAINT "delivery_rates_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wilayas" ADD CONSTRAINT "wilayas_parent_wilaya_id_wilayas_id_fk" FOREIGN KEY ("parent_wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wilayas" ADD CONSTRAINT "wilayas_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_entity_idx" ON "admin_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_idx" ON "admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_login_attempts_email_created_idx" ON "admin_login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "admin_login_attempts_ip_created_idx" ON "admin_login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "wilayas_code_unique" ON "wilayas" USING btree ("code");--> statement-breakpoint
CREATE INDEX "wilayas_parent_idx" ON "wilayas" USING btree ("parent_wilaya_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_wilaya_id_idx" ON "orders" USING btree ("wilaya_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wilaya_code_positive" CHECK ("orders"."wilaya_code" > 0);