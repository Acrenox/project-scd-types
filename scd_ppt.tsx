import { useState } from "react";

const slides = [
  {
    id: 1,
    title: "Slowly Changing Dimensions",
    subtitle: "End-to-End Data Engineering Project",
    type: "cover",
    meta: "Azure Data Factory · Azure SQL Database · ADLS Gen2"
  },
  {
    id: 2,
    title: "Project Overview",
    type: "overview",
    points: [
      { icon: "🎯", title: "Objective", desc: "Build a modular, production-ready SCD pipeline that handles Type 1, 2, and 3 dimension changes using Azure cloud services." },
      { icon: "🏗️", title: "Architecture", desc: "ADLS Gen2 as the data lake source, ADF for orchestration and transformation, Azure SQL DB as the dimensional store." },
      { icon: "📦", title: "Dataset", desc: "Real-world Customers (1000 records) and Products (1000 records) CSV data from Datablist, uploaded to ADLS Gen2." },
      { icon: "⚙️", title: "Design", desc: "Separate pipelines per SCD type, shared Data Flows for staging load, and stored procedures for SCD logic." },
    ]
  },
  {
    id: 3,
    title: "Solution Architecture",
    type: "architecture",
  },
  {
    id: 4,
    title: "What are Slowly Changing Dimensions?",
    type: "scd_intro",
    desc: "In data warehousing, dimension data changes over time. SCD strategies define how to handle these changes — whether to overwrite, preserve history, or track previous values.",
    types: [
      { type: "Type 1", color: "#6366f1", title: "Overwrite", desc: "Simply overwrite old data with new. No history kept. Fast and simple.", use: "Non-critical changes like fixing typos" },
      { type: "Type 2", color: "#0ea5e9", title: "Add New Row", desc: "Insert a new row for each change with Start/End dates and IsCurrent flag. Full history preserved.", use: "Tracking customer city or segment changes" },
      { type: "Type 3", color: "#10b981", title: "Add New Column", desc: "Add Previous and Current columns. Only one level of history kept.", use: "Product category reclassification" },
    ]
  },
  {
    id: 5,
    title: "SCD Type 1 – Overwrite",
    type: "scd_detail",
    color: "#6366f1",
    entity: "dim_customer_scd1",
    how: "MERGE statement: UPDATE on match, INSERT on new. Old value is permanently overwritten.",
    schema: ["CustomerID (PK)", "CustomerName", "Email", "City", "Country", "Company", "UpdatedDate"],
    before: {
      headers: ["CustomerID", "CustomerName", "City", "UpdatedDate"],
      rows: [
        ["1", "Alice Martin", "New York", "2024-01-01"],
        ["2", "Bob Chen", "Chicago", "2024-01-01"],
      ]
    },
    after: {
      headers: ["CustomerID", "CustomerName", "City", "UpdatedDate"],
      rows: [
        ["1", "Alice Martin", "San Francisco ✏️", "2024-04-01"],
        ["2", "Bob Chen", "Chicago", "2024-01-01"],
      ]
    },
    note: "Alice's old city (New York) is permanently lost. No history.",
    adf: "LoadStaging Data Flow → usp_SCD1_Upsert Stored Procedure"
  },
  {
    id: 6,
    title: "SCD Type 2 – Add New Row",
    type: "scd_detail",
    color: "#0ea5e9",
    entity: "dim_customer_scd2",
    how: "Expire old row (IsCurrent=0, EndDate=today), insert new row (IsCurrent=1, StartDate=today).",
    schema: ["SurrogateKey (PK)", "CustomerID (BK)", "CustomerName", "City", "StartDate", "EndDate", "IsCurrent"],
    before: {
      headers: ["SurrogateKey", "CustomerID", "City", "StartDate", "EndDate", "IsCurrent"],
      rows: [
        ["1", "1", "New York", "2024-01-01", "NULL", "1 ✅"],
      ]
    },
    after: {
      headers: ["SurrogateKey", "CustomerID", "City", "StartDate", "EndDate", "IsCurrent"],
      rows: [
        ["1", "1", "New York", "2024-01-01", "2024-04-01", "0 ❌"],
        ["2", "1", "San Francisco 🆕", "2024-04-01", "NULL", "1 ✅"],
      ]
    },
    note: "Full history preserved. Surrogate Key used — not CustomerID — as the Primary Key.",
    adf: "LoadStaging Data Flow → usp_SCD2_Expire_And_Insert Stored Procedure"
  },
  {
    id: 7,
    title: "SCD Type 3 – Add New Column",
    type: "scd_detail",
    color: "#10b981",
    entity: "dim_product_scd3",
    how: "Shift CurrentCategory → PreviousCategory, write new value into CurrentCategory. Only 1 level of history.",
    schema: ["ProductID (PK)", "ProductName", "CurrentCategory", "PreviousCategory", "CurrentPrice", "PreviousPrice"],
    before: {
      headers: ["ProductID", "ProductName", "CurrentCategory", "PreviousCategory"],
      rows: [
        ["101", "Laptop Pro 15", "Electronics", "NULL"],
      ]
    },
    after: {
      headers: ["ProductID", "ProductName", "CurrentCategory", "PreviousCategory"],
      rows: [
        ["101", "Laptop Pro 15", "Computers 🆕", "Electronics ⬅️"],
      ]
    },
    note: "Only one history level. If category changes again, Electronics is permanently lost.",
    adf: "LoadStaging Data Flow → usp_SCD3_Upsert Stored Procedure"
  },
  {
    id: 8,
    title: "ADF Pipeline Design",
    type: "pipeline",
  },
  {
    id: 9,
    title: "Data Flow – Staging Load",
    type: "dataflow",
    steps: [
      { name: "SourceCSV", icon: "📂", color: "#6366f1", desc: "Reads data.csv from ADLS Gen2 raw/ zone. Schema drift enabled to handle varying columns." },
      { name: "AddAuditColumns", icon: "🔧", color: "#8b5cf6", desc: "Derives CustomerID from Index, concatenates First+Last Name, adds _LoadDate = today." },
      { name: "SelectColumns", icon: "✂️", color: "#0ea5e9", desc: "Keeps only 7 needed columns: CustomerID, CustomerName, Email, City, Country, Company, _LoadDate." },
      { name: "SinkStaging", icon: "🗄️", color: "#10b981", desc: "Writes to dbo.stg_customer in Azure SQL DB. Table action: Truncate (idempotent)." },
    ]
  },
  {
    id: 10,
    title: "Stored Procedure Logic",
    type: "sp",
    sps: [
      {
        name: "usp_SCD1_Upsert",
        color: "#6366f1",
        logic: `MERGE dim_customer_scd1 AS tgt
USING stg_customer AS src
  ON tgt.CustomerID = src.CustomerID
WHEN MATCHED → UPDATE all columns
WHEN NOT MATCHED → INSERT new row`,
      },
      {
        name: "usp_SCD2_Expire_And_Insert",
        color: "#0ea5e9",
        logic: `-- Step 1: Expire changed rows
UPDATE dim_customer_scd2
SET EndDate = TODAY, IsCurrent = 0
WHERE CustomerID matches AND values changed

-- Step 2: Insert new version
INSERT new row with IsCurrent=1, StartDate=TODAY`,
      },
      {
        name: "usp_SCD3_Upsert",
        color: "#10b981",
        logic: `MERGE dim_product_scd3 AS tgt
USING stg_product AS src
  ON tgt.ProductID = src.ProductID
WHEN MATCHED AND category changed →
  UPDATE: Previous = Current, Current = New
WHEN NOT MATCHED → INSERT new row`,
      },
    ]
  },
  {
    id: 11,
    title: "ADLS Folder Structure",
    type: "adls",
  },
  {
    id: 12,
    title: "Key Learnings & Challenges",
    type: "learnings",
    items: [
      { icon: "🔍", title: "Schema Drift", desc: "Enabled schema drift in Data Flow source to handle CSV columns that don't perfectly match the target schema." },
      { icon: "✂️", title: "Select Transformation", desc: "Used a Select step to filter out unwanted CSV columns before writing to staging, preventing column mismatch errors." },
      { icon: "📝", title: "Column Name Spaces", desc: "Used byName('Customer Id') and byName('Index') in expressions to safely reference CSV columns with spaces." },
      { icon: "🔗", title: "Inline Sink", desc: "Used Inline sink type in Data Flow instead of Dataset to avoid parameterization complexity in the newer ADF UI." },
      { icon: "⚡", title: "Integration Runtime", desc: "Switched from Debug cluster to AutoResolveIntegrationRuntime for pipeline execution as recommended by ADF." },
      { icon: "🔑", title: "Surrogate Key", desc: "SCD Type 2 uses a Surrogate Key (identity column) as PK, never the business key, to uniquely identify each version." },
    ]
  },
  {
    id: 13,
    title: "SCD Type Comparison",
    type: "comparison",
    headers: ["Feature", "Type 1", "Type 2", "Type 3"],
    rows: [
      ["History Kept", "❌ None", "✅ Full", "⚠️ One level"],
      ["Storage Impact", "Low", "High", "Medium"],
      ["Complexity", "Simple", "Complex", "Medium"],
      ["Primary Key", "Business Key", "Surrogate Key", "Business Key"],
      ["Extra Columns", "None", "StartDate, EndDate, IsCurrent", "Previous + Current columns"],
      ["Use Case", "Fix errors", "Track all changes", "Track last change only"],
      ["Our Entity", "Customer", "Customer", "Product"],
    ],
    colors: ["#6366f1", "#0ea5e9", "#10b981"]
  },
  {
    id: 14,
    title: "Thank You",
    type: "end",
    points: ["Azure Data Factory", "Azure SQL Database", "ADLS Gen2", "SCD Type 1, 2 & 3", "Data Flows", "Stored Procedures"]
  }
];

const architectureSlide = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 8px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
      {[
        { icon: "📂", label: "ADLS Gen2", sub: "raw/customer/data.csv\nraw/product/data.csv", color: "#6366f1" },
        { icon: "→", label: "", color: "transparent", sub: "" },
        { icon: "⚙️", label: "Azure Data Factory", sub: "Data Flows\nPipelines\nStored Proc Activities", color: "#0ea5e9" },
        { icon: "→", label: "", color: "transparent", sub: "" },
        { icon: "🗄️", label: "Azure SQL Database", sub: "stg_customer\nstg_product\ndim tables", color: "#10b981" },
      ].map((item, i) => item.icon === "→" ? (
        <div key={i} style={{ fontSize: 28, color: "#475569" }}>→</div>
      ) : (
        <div key={i} style={{ background: "#1e293b", border: `2px solid ${item.color}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", minWidth: 160 }}>
          <div style={{ fontSize: 32 }}>{item.icon}</div>
          <div style={{ color: item.color, fontWeight: 700, fontSize: 13, marginTop: 6 }}>{item.label}</div>
          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4, whiteSpace: "pre-line" }}>{item.sub}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 8 }}>
      {[
        { label: "Source Zone", detail: "ADLS raw/ folder\nCSV files dropped here\nTriggers pipeline run", color: "#6366f1" },
        { label: "Transform Zone", detail: "ADF Data Flow\nDerive + Select columns\nLoad into staging table", color: "#0ea5e9" },
        { label: "Serve Zone", detail: "SCD dim tables\nReady for BI/reporting\nFull history in SCD2", color: "#10b981" },
      ].map((z, i) => (
        <div key={i} style={{ background: "#1e293b", borderRadius: 8, padding: 12, borderTop: `3px solid ${z.color}` }}>
          <div style={{ color: z.color, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{z.label}</div>
          <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-line" }}>{z.detail}</div>
        </div>
      ))}
    </div>
  </div>
);

const pipelineSlide = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {[
        { name: "PL_SCD1_Customer", color: "#6366f1", steps: ["Data Flow\nDF_Load_Customer_Staging", "Stored Procedure\nusp_SCD1_Upsert"] },
        { name: "PL_SCD2_Customer", color: "#0ea5e9", steps: ["Data Flow\nDF_Load_Customer_Staging", "Stored Procedure\nusp_SCD2_Expire_And_Insert"] },
        { name: "PL_SCD3_Product", color: "#10b981", steps: ["Data Flow\nDF_Load_Product_Staging", "Stored Procedure\nusp_SCD3_Upsert"] },
      ].map((p, i) => (
        <div key={i} style={{ background: "#1e293b", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: p.color, padding: "8px 12px", fontWeight: 700, fontSize: 12, color: "#fff" }}>{p.name}</div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {p.steps.map((s, j) => (
              <div key={j} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ background: "#0f172a", border: `1px solid ${p.color}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#cbd5e1", textAlign: "center", whiteSpace: "pre-line", width: "100%" }}>{s}</div>
                {j < p.steps.length - 1 && <div style={{ color: p.color, fontSize: 16 }}>↓</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div style={{ background: "#1e293b", borderRadius: 10, padding: 14, borderLeft: "4px solid #f59e0b" }}>
      <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>PL_Master — Orchestrator</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {["Execute PL_SCD1_Customer", "→", "Execute PL_SCD2_Customer", "→", "Execute PL_SCD3_Product"].map((s, i) => (
          s === "→" ? <div key={i} style={{ color: "#f59e0b", fontSize: 18 }}>→</div> :
          <div key={i} style={{ background: "#0f172a", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "#cbd5e1" }}>{s}</div>
        ))}
      </div>
      <div style={{ color: "#64748b", fontSize: 11, marginTop: 8 }}>Each child pipeline runs sequentially with "Wait on completion" enabled.</div>
    </div>
  </div>
);

const adlsSlide = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
    <div style={{ background: "#1e293b", borderRadius: 10, padding: 16 }}>
      <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 12 }}>📁 Container: datalake</div>
      {[
        { folder: "raw/", sub: ["customer/data.csv", "product/data.csv"], color: "#6366f1", desc: "Landing zone — files dropped here trigger pipelines" },
        { folder: "processed/", sub: ["customer/", "product/"], color: "#0ea5e9", desc: "Successfully loaded files moved here" },
        { folder: "rejected/", sub: ["invalid records"], color: "#ef4444", desc: "Bad records from Data Flow quality check" },
      ].map((f, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ color: f.color, fontWeight: 700, fontSize: 13 }}>📂 {f.folder}</div>
          {f.sub.map((s, j) => <div key={j} style={{ color: "#94a3b8", fontSize: 12, paddingLeft: 16 }}>└ 📄 {s}</div>)}
          <div style={{ color: "#475569", fontSize: 11, paddingLeft: 16, marginTop: 2 }}>{f.desc}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#1e293b", borderRadius: 10, padding: 16 }}>
        <div style={{ color: "#0ea5e9", fontWeight: 700, marginBottom: 10 }}>📊 SQL Tables</div>
        {[
          { name: "stg_customer", type: "Staging", color: "#475569" },
          { name: "stg_product", type: "Staging", color: "#475569" },
          { name: "dim_customer_scd1", type: "SCD Type 1", color: "#6366f1" },
          { name: "dim_customer_scd2", type: "SCD Type 2", color: "#0ea5e9" },
          { name: "dim_product_scd3", type: "SCD Type 3", color: "#10b981" },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1e293b" }}>
            <div style={{ color: "#cbd5e1", fontSize: 12 }}>🗄️ dbo.{t.name}</div>
            <div style={{ color: t.color, fontSize: 11, fontWeight: 600 }}>{t.type}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#1e293b", borderRadius: 10, padding: 16 }}>
        <div style={{ color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>🔗 Linked Services</div>
        {["LS_ADLS_Gen2 → ADLS Account Key auth", "LS_AzureSQLDB → SQL Authentication"].map((l, i) => (
          <div key={i} style={{ color: "#94a3b8", fontSize: 12, padding: "4px 0" }}>• {l}</div>
        ))}
      </div>
    </div>
  </div>
);

export default function App() {
  const [current, setCurrent] = useState(0);
  const slide = slides[current];
  const total = slides.length;

  const renderSlide = () => {
    if (slide.type === "cover") return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏗️</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#f8fafc", margin: 0, lineHeight: 1.2 }}>{slide.title}</h1>
        <p style={{ fontSize: 18, color: "#6366f1", marginTop: 12, fontWeight: 600 }}>{slide.subtitle}</p>
        <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {slide.meta.split(" · ").map((m, i) => (
            <span key={i} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 20, padding: "6px 16px", color: "#94a3b8", fontSize: 13 }}>{m}</span>
          ))}
        </div>
      </div>
    );

    if (slide.type === "overview") return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, height: "100%" }}>
        {slide.points.map((p, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 12, padding: 20, borderLeft: "4px solid #6366f1" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
            <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{p.title}</div>
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>{p.desc}</div>
          </div>
        ))}
      </div>
    );

    if (slide.type === "architecture") return architectureSlide();

    if (slide.type === "scd_intro") return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0, lineHeight: 1.7 }}>{slide.desc}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {slide.types.map((t, i) => (
            <div key={i} style={{ background: "#1e293b", borderRadius: 12, padding: 16, borderTop: `4px solid ${t.color}` }}>
              <div style={{ color: t.color, fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{t.type}</div>
              <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{t.title}</div>
              <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>{t.desc}</div>
              <div style={{ background: "#0f172a", borderRadius: 6, padding: "6px 10px", color: t.color, fontSize: 11 }}>📌 {t.use}</div>
            </div>
          ))}
        </div>
      </div>
    );

    if (slide.type === "scd_detail") return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#1e293b", borderRadius: 10, padding: 14 }}>
            <div style={{ color: slide.color, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>📋 Table: {slide.entity}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {slide.schema.map((col, i) => (
                <span key={i} style={{ background: "#0f172a", border: `1px solid ${slide.color}33`, borderRadius: 4, padding: "3px 8px", color: "#cbd5e1", fontSize: 11 }}>{col}</span>
              ))}
            </div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 10, padding: 14 }}>
            <div style={{ color: slide.color, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>⚙️ How it works</div>
            <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.7 }}>{slide.how}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[{ label: "BEFORE", data: slide.before }, { label: "AFTER", data: slide.after }].map((t, ti) => (
            <div key={ti} style={{ background: "#1e293b", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: ti === 0 ? "#334155" : slide.color, padding: "6px 12px", color: "#fff", fontWeight: 700, fontSize: 12 }}>{t.label}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr>{t.data.headers.map((h, i) => <th key={i} style={{ padding: "6px 10px", color: "#64748b", textAlign: "left", borderBottom: "1px solid #334155" }}>{h}</th>)}</tr></thead>
                  <tbody>{t.data.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: "6px 10px", color: "#cbd5e1", borderBottom: "1px solid #1e293b" }}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 14px", flex: 1, borderLeft: `3px solid ${slide.color}` }}>
            <span style={{ color: "#f59e0b", fontSize: 12 }}>⚠️ Note: </span><span style={{ color: "#94a3b8", fontSize: 12 }}>{slide.note}</span>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 14px", flex: 1, borderLeft: `3px solid ${slide.color}` }}>
            <span style={{ color: slide.color, fontSize: 12 }}>🔧 ADF: </span><span style={{ color: "#94a3b8", fontSize: 12 }}>{slide.adf}</span>
          </div>
        </div>
      </div>
    );

    if (slide.type === "pipeline") return pipelineSlide();

    if (slide.type === "dataflow") return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          {slide.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ background: "#1e293b", borderRadius: 10, padding: 16, border: `2px solid ${s.color}`, flex: 1 }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ color: s.color, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{s.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>{s.desc}</div>
              </div>
              {i < slide.steps.length - 1 && <div style={{ color: "#475569", fontSize: 22, padding: "0 6px" }}>→</div>}
            </div>
          ))}
        </div>
        <div style={{ background: "#1e293b", borderRadius: 10, padding: 14, borderLeft: "4px solid #f59e0b" }}>
          <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Key Decisions Made</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              "Used byName('Index') instead of byName('Customer Id') to avoid null CustomerID",
              "Used Inline sink type to avoid dataset parameterization issues in newer ADF UI",
              "Removed ConditionalSplit — clean dataset needed no quality filtering",
              "Table action: Truncate ensures idempotent runs — safe to rerun anytime",
            ].map((d, i) => (
              <div key={i} style={{ color: "#94a3b8", fontSize: 12, padding: "6px 10px", background: "#0f172a", borderRadius: 6 }}>✔ {d}</div>
            ))}
          </div>
        </div>
      </div>
    );

    if (slide.type === "sp") return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {slide.sps.map((sp, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: sp.color, padding: "8px 12px", fontWeight: 700, fontSize: 12, color: "#fff" }}>⚙️ {sp.name}</div>
            <pre style={{ margin: 0, padding: 14, color: "#94a3b8", fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{sp.logic}</pre>
          </div>
        ))}
      </div>
    );

    if (slide.type === "adls") return adlsSlide();

    if (slide.type === "learnings") return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {slide.items.map((item, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{item.title}</div>
            <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    );

    if (slide.type === "comparison") return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {slide.headers.map((h, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: "left", background: i === 0 ? "#1e293b" : slide.colors[i - 1], color: "#fff", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slide.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#0f172a" : "#131f35" }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "10px 14px", color: j === 0 ? "#94a3b8" : "#e2e8f0", borderBottom: "1px solid #1e293b", fontWeight: j === 0 ? 600 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    if (slide.type === "end") return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🙏</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#f8fafc", margin: 0 }}>{slide.title}</h1>
        <p style={{ color: "#94a3b8", marginTop: 12, fontSize: 14 }}>Built end-to-end using:</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 12 }}>
          {slide.points.map((p, i) => (
            <span key={i} style={{ background: "#1e293b", border: "1px solid #6366f1", borderRadius: 20, padding: "8px 18px", color: "#6366f1", fontSize: 13, fontWeight: 600 }}>{p}</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0f172a", minHeight: "100vh", display: "flex", flexDirection: "column", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#6366f1", fontWeight: 700, fontSize: 14 }}>SCD Project Presentation</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>Slide {current + 1} / {total}</div>
      </div>

      {/* Slide */}
      <div style={{ flex: 1, padding: "24px 32px", display: "flex", flexDirection: "column" }}>
        {slide.type !== "cover" && slide.type !== "end" && (
          <h2 style={{ margin: "0 0 20px 0", fontSize: 22, fontWeight: 800, color: "#f8fafc", borderBottom: "2px solid #6366f1", paddingBottom: 10 }}>
            {slide.title}
          </h2>
        )}
        <div style={{ flex: 1 }}>
          {renderSlide()}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ background: "#1e293b", borderTop: "1px solid #334155", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}
          style={{ padding: "8px 20px", background: current === 0 ? "#334155" : "#6366f1", border: "none", borderRadius: 8, color: current === 0 ? "#64748b" : "#fff", cursor: current === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}>
          ← Previous
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              style={{ width: i === current ? 24 : 8, height: 8, borderRadius: 4, border: "none", background: i === current ? "#6366f1" : "#334155", cursor: "pointer", transition: "all 0.2s" }} />
          ))}
        </div>
        <button onClick={() => setCurrent(Math.min(total - 1, current + 1))} disabled={current === total - 1}
          style={{ padding: "8px 20px", background: current === total - 1 ? "#334155" : "#6366f1", border: "none", borderRadius: 8, color: current === total - 1 ? "#64748b" : "#fff", cursor: current === total - 1 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}>
          Next →
        </button>
      </div>
    </div>
  );
}
