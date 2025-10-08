import { pgTable, varchar, numeric, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const supplyChainData = pgTable("supply_chain_data", {
	productType: varchar("product_type", { length: 50 }),
	sku: varchar({ length: 50 }).primaryKey().notNull(),
	price: numeric(),
	availability: integer(),
	numberOfProductsSold: integer("number_of_products_sold"),
	revenueGenerated: numeric("revenue_generated"),
	customerDemographics: varchar("customer_demographics", { length: 50 }),
	stockLevels: integer("stock_levels"),
	leadTimes: integer("lead_times"),
	orderQuantities: integer("order_quantities"),
	shippingTimes: integer("shipping_times"),
	shippingCarriers: varchar("shipping_carriers", { length: 100 }),
	shippingCosts: numeric("shipping_costs"),
	supplierName: varchar("supplier_name", { length: 100 }),
	location: varchar({ length: 100 }),
	leadTime: integer("lead_time"),
	productionVolumes: integer("production_volumes"),
	manufacturingLeadTime: integer("manufacturing_lead_time"),
	manufacturingCosts: numeric("manufacturing_costs"),
	inspectionResults: varchar("inspection_results", { length: 50 }),
	defectRates: numeric("defect_rates"),
	transportationModes: varchar("transportation_modes", { length: 50 }),
	routes: varchar({ length: 50 }),
	costs: numeric(),
});
