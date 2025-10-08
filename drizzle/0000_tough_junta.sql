-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "supply_chain_data" (
	"product_type" varchar(50),
	"sku" varchar(50) PRIMARY KEY NOT NULL,
	"price" numeric,
	"availability" integer,
	"number_of_products_sold" integer,
	"revenue_generated" numeric,
	"customer_demographics" varchar(50),
	"stock_levels" integer,
	"lead_times" integer,
	"order_quantities" integer,
	"shipping_times" integer,
	"shipping_carriers" varchar(100),
	"shipping_costs" numeric,
	"supplier_name" varchar(100),
	"location" varchar(100),
	"lead_time" integer,
	"production_volumes" integer,
	"manufacturing_lead_time" integer,
	"manufacturing_costs" numeric,
	"inspection_results" varchar(50),
	"defect_rates" numeric,
	"transportation_modes" varchar(50),
	"routes" varchar(50),
	"costs" numeric
);

*/