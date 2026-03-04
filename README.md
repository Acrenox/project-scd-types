# Slowly Changing Dimensions (SCD) – End-to-End Data Engineering Project

> A modular, production-ready SCD pipeline built on Azure — handling Type 1, Type 2, and Type 3 dimension changes using Azure Data Factory, Azure SQL Database, and ADLS Gen2.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [SCD Types Implemented](#scd-types-implemented)
- [Project Structure](#project-structure)
- [Dataset](#dataset)
- [ADF Pipelines](#adf-pipelines)
- [Data Flows](#data-flows)
- [Stored Procedures](#stored-procedures)
- [SQL Tables](#sql-tables)
- [How to Run](#how-to-run)
- [Key Learnings](#key-learnings)

---

## Overview

This project demonstrates how to implement all three types of Slowly Changing Dimensions in a real Azure cloud environment. Source CSV files are ingested from ADLS Gen2, transformed via ADF Data Flows, staged in Azure SQL Database, and finally loaded into dimension tables using stored procedures that apply the appropriate SCD logic.

---

## Architecture

```
ADLS Gen2 (raw/)
      ↓
Azure Data Factory
  ├── Data Flow: Load CSV → Staging Table
  └── Stored Procedure: Apply SCD Logic
      ↓
Azure SQL Database
  ├── stg_customer
  ├── stg_product
  ├── dim_customer_scd1
  ├── dim_customer_scd2
  └── dim_product_scd3
```

---

## Tech Stack

| Service | Purpose |
|---|---|
| Azure Data Lake Storage Gen2 | Source CSV file storage (raw / processed / rejected zones) |
| Azure Data Factory | Pipeline orchestration, Data Flows, SP activities |
| Azure SQL Database | Staging tables, dimension tables, stored procedures |

---

## SCD Types Implemented

### SCD Type 1 — Overwrite
- Old data is overwritten with new data
- No history is retained
- Implemented via `MERGE` statement — UPDATE on match, INSERT on new
- Target table: `dim_customer_scd1`

### SCD Type 2 — Add New Row
- A new row is inserted for every change
- Old row is expired: `IsCurrent = 0`, `EndDate = today`
- New row is inserted: `IsCurrent = 1`, `StartDate = today`
- Full history preserved using a **Surrogate Key** as Primary Key
- Target table: `dim_customer_scd2`

### SCD Type 3 — Add New Column
- Previous value is shifted into a `Previous` column
- New value is written into the `Current` column
- Only **one level** of history is kept
- Target table: `dim_product_scd3`

---

## Project Structure

```
SCD_Project/
├── SQL/
│   ├── DDL/
│   │   ├── stg_customer.sql
│   │   ├── stg_product.sql
│   │   ├── dim_customer_scd1.sql
│   │   ├── dim_customer_scd2.sql
│   │   └── dim_product_scd3.sql
│   └── StoredProcedures/
│       ├── usp_SCD1_Upsert.sql
│       ├── usp_SCD2_Expire_And_Insert.sql
│       └── usp_SCD3_Upsert.sql
├── ADF/
│   ├── LinkedServices/
│   │   ├── LS_ADLS_Gen2
│   │   └── LS_AzureSQLDB
│   ├── Datasets/
│   │   ├── DS_ADLS_Customer
│   │   └── DS_ADLS_Product
│   ├── DataFlows/
│   │   ├── DF_Load_Customer_Staging
│   │   └── DF_Load_Product_Staging
│   └── Pipelines/
│       ├── PL_SCD1_Customer
│       ├── PL_SCD2_Customer
│       ├── PL_SCD3_Product
│       └── PL_Master
├── Data/
│   ├── customers-1000.csv
│   └── products-1000.csv
└── README.md
```

---

## Dataset

Source: [Datablist Sample CSV Files](https://www.datablist.com/learn/csv/download-sample-csv-files) — free, no login required.

| File | Records | Used For |
|---|---|---|
| customers-1000.csv | 1000 | dim_customer_scd1, dim_customer_scd2 |
| products-1000.csv | 1000 | dim_product_scd3 |

### Customer CSV Schema
| Column | Type | Mapped To |
|---|---|---|
| Index | INT | CustomerID |
| First Name + Last Name | STRING | CustomerName (concatenated) |
| Email | STRING | Email |
| City | STRING | City |
| Country | STRING | Country |
| Company | STRING | Company |

### Product CSV Schema
| Column | Type | Mapped To |
|---|---|---|
| Index | INT | ProductID |
| Name | STRING | ProductName |
| Category | STRING | CurrentCategory |
| Price | DECIMAL | CurrentPrice |

---

## ADF Pipelines

### `PL_Master` — Orchestrator
Runs all 3 child pipelines sequentially with **Wait on Completion** enabled.
```
Execute PL_SCD1_Customer → Execute PL_SCD2_Customer → Execute PL_SCD3_Product
```

### `PL_SCD1_Customer`
```
Data Flow: DF_Load_Customer_Staging → Stored Procedure: usp_SCD1_Upsert
```

### `PL_SCD2_Customer`
```
Data Flow: DF_Load_Customer_Staging → Stored Procedure: usp_SCD2_Expire_And_Insert
```

### `PL_SCD3_Product`
```
Data Flow: DF_Load_Product_Staging → Stored Procedure: usp_SCD3_Upsert
```

---

## Data Flows

### `DF_Load_Customer_Staging`

| Step | Transformation | Description |
|---|---|---|
| 1 | Source | Reads data.csv from ADLS Gen2. Schema drift enabled. |
| 2 | Derived Column | Derives CustomerID, CustomerName, Email, City, Country, Company, _LoadDate |
| 3 | Select | Keeps only the 7 required columns — drops all raw CSV columns |
| 4 | Sink | Inline sink → Azure SQL DB → dbo.stg_customer. Table action: Truncate |

**Key expressions:**
```
CustomerID   = toInteger(byName('Index'))
CustomerName = concat(byName('First Name'), ' ', byName('Last Name'))
_LoadDate    = currentDate()
```

### `DF_Load_Product_Staging`

| Step | Transformation | Description |
|---|---|---|
| 1 | Source | Reads data.csv from ADLS Gen2. Schema drift enabled. |
| 2 | Derived Column | Derives ProductID, ProductName, Category, Price, _LoadDate |
| 3 | Select | Keeps only the 5 required columns |
| 4 | Sink | Inline sink → Azure SQL DB → dbo.stg_product. Table action: Truncate |

---

## Stored Procedures

### `usp_SCD1_Upsert`
```sql
MERGE dim_customer_scd1 AS tgt
USING stg_customer AS src ON tgt.CustomerID = src.CustomerID
WHEN MATCHED     → UPDATE all columns + UpdatedDate = GETDATE()
WHEN NOT MATCHED → INSERT new row
```

### `usp_SCD2_Expire_And_Insert`
```sql
-- Step 1: Expire changed records
UPDATE dim_customer_scd2
SET IsCurrent = 0, EndDate = today
WHERE CustomerID matches AND any tracked column has changed

-- Step 2: Insert new version
INSERT new row with IsCurrent = 1, StartDate = today
WHERE no current row exists for that CustomerID
```

### `usp_SCD3_Upsert`
```sql
MERGE dim_product_scd3 AS tgt
USING stg_product AS src ON tgt.ProductID = src.ProductID
WHEN MATCHED AND category changed →
  PreviousCategory = CurrentCategory
  CurrentCategory  = new value
WHEN NOT MATCHED →
  INSERT with PreviousCategory = NULL
```

---

## SQL Tables

### Staging Tables
```sql
-- stg_customer
CustomerID INT, CustomerName VARCHAR(200), Email VARCHAR(150),
City VARCHAR(100), Country VARCHAR(100), Company VARCHAR(200), _LoadDate DATE

-- stg_product
ProductID INT, ProductName VARCHAR(200), Category VARCHAR(100),
Price DECIMAL(10,2), _LoadDate DATE
```

### Dimension Tables
```sql
-- dim_customer_scd1 (Type 1)
CustomerID INT PRIMARY KEY, CustomerName, Email, City, Country, Company, UpdatedDate

-- dim_customer_scd2 (Type 2)
SurrogateKey INT IDENTITY PRIMARY KEY, CustomerID INT,
CustomerName, Email, City, Country, Company,
StartDate DATE, EndDate DATE NULL, IsCurrent BIT

-- dim_product_scd3 (Type 3)
ProductID INT PRIMARY KEY, ProductName,
CurrentCategory, PreviousCategory NULL,
CurrentPrice DECIMAL, PreviousPrice NULL, UpdatedDate
```

---

## How to Run

### Prerequisites
- Azure subscription with ADLS Gen2, Azure SQL DB, and ADF created
- SQL tables and stored procedures deployed
- CSV files uploaded to ADLS:
  - `datalake/raw/customer/data.csv`
  - `datalake/raw/product/data.csv`

### Steps
1. Open ADF Studio → Author → Pipelines
2. Open `PL_Master`
3. Click **Debug** (or activate a trigger)
4. Monitor pipeline run in the **Output** tab
5. Validate results in Azure SQL Query Editor:

```sql
-- SCD Type 1
SELECT COUNT(*) FROM dbo.dim_customer_scd1;

-- SCD Type 2
SELECT COUNT(*) FROM dbo.dim_customer_scd2;
SELECT * FROM dbo.dim_customer_scd2 WHERE CustomerID = 1 ORDER BY StartDate;

-- SCD Type 3
SELECT COUNT(*) FROM dbo.dim_product_scd3;
```

### Testing SCD Type 2 History
To verify SCD2 history tracking, modify ~20 rows in `customers.csv` (change City or Company), re-upload, and rerun `PL_SCD2_Customer`. You should see:
- Old rows with `IsCurrent = 0` and `EndDate` populated
- New rows with `IsCurrent = 1` and new values

---

## Key Learnings

| Challenge | Solution |
|---|---|
| CSV columns have spaces (`Customer Id`) | Used `byName('Index')` instead to get a clean integer CustomerID |
| All 15 CSV columns flowing into staging | Added a **Select** transformation to keep only the 7 needed columns |
| Dataset parameters not showing in Sink | Switched to **Inline sink** type — bypasses dataset parameterization entirely |
| Debug cluster conflict in pipeline runs | Used **AutoResolveIntegrationRuntime** instead of Debug cluster |
| Stored procedures had dynamic SQL with parameters | Replaced with hardcoded SPs — simpler, easier to debug, no parameter mismatch |
| Duplicate ProductIDs in staging | Set Sink table action to **Truncate** to clear staging before every load |
| SCD Type 2 Surrogate Key | Always use an `IDENTITY` surrogate key as PK — never the business key |

---

## Author

Built as a data engineering project to demonstrate SCD implementation patterns on the Azure cloud stack.
