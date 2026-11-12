# DHA Islamabad-Rawalpindi: Website Content Analysis for the Service Agent

**Source analysed:** https://www.dhai-r.com.pk/ (public website), plus the documents and pages you downloaded into `D:\codes\DHA`
**Analysis date:** 29 Oct 2026
**Scope:** Source #1 (public website) only. The mobile app, member portal accounts, and resident accounts come later.

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Downloaded files analysed | 120 documents (52 PDF, 50 DOC, 18 DOCX) + 3 saved HTML pages |
| Live pages reviewed in addition | 12 (Home, FAQs, Contact Numbers, Utility/Water bill, Other Activities, Sales Lounge, News, Phases, Facilities, Important Notices, Blacklisted, Member Portal Guide) |
| Unique documents after de-duplication | ~105 (13 groups of byte-identical duplicates) |
| Documents with no text layer (scanned) | 23. They need OCR, and they include the **Schedule of Charges 2022** |
| Largest knowledge asset | **DHA Byelaws & Regulations 2022 (Updated 2023)**: 112 pages, ~45,000 words, 16 chapters |

**Main conclusions**

1. **The website is a strong source of procedures and policy**, but it offers almost nothing transactional. It can drive an agent that is good at **"how do I…", "what documents do I need…", "how much does it cost…", "who do I contact…", and "which form…"**. Everything personal (dues, bills, transfer status, membership details) has to come from later sources, such as the member portal or the ERP/finance APIs.
2. **About 70% of the useful content sits in downloadable documents**, not HTML pages. The HTML pages are mostly menus and lists of links. The main exceptions are FAQs, Contact Numbers and Other Activities.
3. **There are serious conflicts between versions.** Fees and processing times differ across the FAQ page (some rates date from 2006), the 2018 procedure documents, the Dec 2022 Schedule of Charges and an Aug 2026 notice. **If the agent is fed this content naively, it will quote wrong fees.** The knowledge base needs a single fee table with an effective date and a precedence rule (§6).
4. **The content falls into 7 types** (§4). Each type needs different handling: retrieval (RAG), structured lookup tables, process workflows, a form catalogue, a contact directory, transactional hand-offs, and time-bound notices.
5. **Some content is sensitive.** The contact page lists named staff with personal mobile numbers, and some forms carry an internal "Viewed by …" watermark. Both need a policy before ingestion (§8).

---

## 2. Website Structure (Information Architecture)

```
dhai-r.com.pk
├── HOME ─ tiles: DHA Marketplace (dhamarketplace.com) · Important Notices · Phases · Facilities
│          · Price Valuations (PVBM.pdf) · Affiliates · Margalla Enclave Ballot
│          · Buy/Sell (dha360.pk) · Margalla Orchards Plot Conversion Process (PDF)
├── MEDIA ─ Advertisement · Events & Activities · Videos · VR View · News
├── PROCEDURE
│   ├── DHA Byelaws (PDF, 112 pp)                ← core policy corpus
│   ├── Visual Byelaws (PDF, 21 pp, diagrams)    ← building-control illustrations
│   ├── DHA Valley downloads  (/valley-downloads-list/)
│   ├── Transfer Procedure downloads (/tfr-proc-downloads-list/)
│   └── Download (/downloads-list/)  ~95 links across 18 categories
├── DHA SALES LOUNGE ─ Intro & Services · Sale of Property (form) · Purchase (form) · Subscribe (form)
├── FOR RESIDENT ─ Utility bill (Consumer ID lookup) · Water bill (Consumer ID lookup)
│                  · Resident/Member Email Info (form) · Blacklisted (image gallery) · Other Activities
├── MEMBER PORTAL ─ Register / Login (member.dhai-r.com.pk) · Guide (video only)
└── FOOTER ─ About · FAQs · Contact us (form) · Contact Numbers · T&C · Careers · Mobile App
            UAN 111-555-400 · Complaints 1092 · Security 0800-34247 · JV +92-51-925-4475
            Social: Facebook, Instagram, LinkedIn, YouTube, WhatsApp channel, TikTok
```

**Download categories on `/downloads-list/`:** Allotment Certificate Endorsement · Application for Possession · Car Sticker/Lab/Servant forms · Consultant Registration · Criteria for Professionals · Stamp Vendor Services · DHA Property Rentals · Documents (All Projects) · Duplicate Allotment Letter · Membership Form · Procedures (All Projects) · Registration form for professionals · Plot Account Statement · Schedule of Charges (Dec 2022) · SOP Burial · Supplier/Contractor/Dealer Registration · Transfer of House/Shop.

---

## 3. Content Inventory by Service Domain

The **Owner Dte** column shows which directorate owns the content. The agent can use it to route questions and escalations.

| # | Service domain | Owner Dte | Key sources (downloaded) | What the agent can answer |
|---|---|---|---|---|
| A | **Property transfer** (Normal, Gift/Hiba, Legal Heir/Widow, GPA, SPA, Outstation, Corporate) | Transfer & Record, Finance, Legal | 7-All-Transfer-Procedure, 8–12 procedure docs, Out-Sta-Tfr-Aug-2026, FAQs, plus ~20 templates (affidavits, undertakings, agreement to sell, gift deed, GPA/SPA specimens) | Step sequence, required documents per transfer type, stamp-paper values, who signs and attests, fees, processing times, physical-presence rules |
| B | **Dues, NDC & payments** | Finance Dte | Request for Statement of Dues 2022, Request for NDC 2022, NDC form (DHAI-502F), Authority letters, Plot Account Statement request, Monthly Rent Challan, Schedule of Charges | How to request dues and NDC, validity (dues 15 days, NDC 3 months), re-issue fees, accepted payment modes (pay order/draft, Askari Bank; **no cash or cheque**), tax items (236C/236K advance tax, PSID, stamp duty) |
| C | **Allotment documents** | Transfer & Record | Collection of Allotment, Duplicate Allotment Letter procedure and specimen, Risk Certificate, Authority for collection, Allotment Cert Endorsement, Change of Address, Plot Verification | Collection windows (3 months local, 6 months overseas, Rs 5,000 late fee), courier at own risk, duplicate letter (newspaper ads, affidavit), endorsement fees by plot size |
| D | **DHA Valley / Own Projects** | T&R (Valley desk), Finance | File Opening, File Conversion (Cert → Letter), Valley conversion procedure, Open/Revised Allotment Certificate requests, Ph-7 affidavits (lost/corrected deposit slip), Account Statement Ph-7 | File opening fees by category (5M/8M/OS block in USD/Comm/Shop), conversion steps, the 3-day collection rule for certificates, 7-working-day letter issuance |
| E | **Membership** | T&R | MS_FORM (DHAI-R 400), FAQs, SOC | Membership required per plot and per phase, fee tiers by size, 50% concession for serving defence officers and DHA employees, membership card re-issue |
| F | **Possession, site plan & town planning** | Town Planning | Possession/Demarcation application (DHAI-301T), FAQs (12-step possession flow), Byelaws Ch VI | Site plan steps, 20-working-day SLA, site plan valid 3 months, extra land categories A/B/C, amalgamation and sub-division rules |
| G | **Construction & building control** | Building Control | Byelaws Ch VII–VIII (106 clauses), Visual Byelaws (21 pp), professional criteria (Architect, Structure, Vetting, MEP, Soil, Solar), Other Activities | Approval workflow, drawing scrutiny fees, working hours (till 7 pm winter / 9 pm summer), green-cloth rule, solar via registered firms, setbacks/height/basement rules, completion certificate |
| H | **Security, access & tenancy** | Security Dte | E-Tag forms (Resident, Employee, Frequent Visitor, Ex-Bahria, Non-resident officers), Car Sticker (Flag-A), Servant/Maid/Driver pass, Police verification, CCTV recording request, NOC for renting and vacating (house and commercial), Contractor/Labour security form | Who qualifies for which E-Tag, charges (Rs 600 resident, Rs 1,200 visitor, Rs 300 employee renewal, Rs 800 10-Corps integration), 1-year validity, tenant NOC document list (incl. the female-tenant rule), CCTV request conditions |
| I | **Vendors, contractors, professionals, dealers** | Building Control, SCM, Tech/CE, Security, T&R | Registration forms (Architect, Structure, Vetting, MEP, Soil Lab, Solar), criteria docs, Consultant Registration, Supplier registration/verification, Contractor registration, Property Dealer registration, Stamp Vendor form | Eligibility criteria (degree, PEC/PCATP, years of experience), fees (Rs 50k registration / Rs 25k renewal for professionals; dealer Rs 50k / Rs 25k), where to submit |
| J | **Community & municipal services** | Admin, Environment, Services | Byelaws Ch IX–XI, SOP Burial (normal, COVID), graveyard supervisor contacts, Facilities page | Graveyard eligibility (owner-residents, not plot-only members), burial procedure and documents, pets, noise, cleanliness, water bowsers, sewerage, complaints office (1092) |
| K | **Commercial rentals (DHA-owned shops)** | Business Development | Rental Property application, Monthly Rent Challan, Byelaws Ch IV | How to apply for a DHA-owned shop or office, rent deposit account details |
| L | **Sales & marketing** | Marketing / Sales Lounge | Sales Lounge page, Sale/Purchase forms, PVBM price valuation PDF, Margalla Enclave Ballot, Margalla Orchards conversion | Sales lounge services and contacts, routing to the marketplace and dha360.pk, ballot and conversion info |
| M | **Fines, penalties & regularization** | All Dtes | Byelaws Ch XIV–XV | Fine amounts by directorate and violation, regularization charges |
| N | **Organisation directory** | All | Contact Numbers page, footer, form footers | Phone, extension and email routing by department, phase and topic |

---

## 4. Content Types and How the Agent Uses Each

The corpus breaks down into seven content types. Each one needs a different ingestion approach and gives the agent a different capability.

| Type | Examples | Volume | Agent capability | Recommended handling |
|---|---|---|---|---|
| **T1. Policy / regulation text** | Byelaws (16 chapters), Visual Byelaws | ~45k words | Answer rule questions with citations ("Can I build a basement?", "What are construction hours?") | RAG with **clause-level chunks** (keep the `8.47`-style clause numbers as metadata); always cite the clause |
| **T2. Fee / charge tables** | Schedule of Charges Dec 2022, Out-Station notice Aug 2026, fees inside procedures, E-Tag charges | ~150 distinct fee items | Exact fee quotes and fee calculation (e.g. transfer fee by size × transfer type) | **Structured table** (`fee_item, category, size_band, amount, currency, effective_from, source, superseded_by`), queried by a tool and **not** retrieved through RAG. Never let the LLM paraphrase fees from text |
| **T3. Procedures / workflows** | Normal/Gift/GPA/SPA/Legal-heir transfer, NDC, possession, file opening, duplicate letter, lien marking | ~20 procedures | Step-by-step guidance, checklists, "what's next" | Model as **process graphs**: steps → actor/desk → documents → fee refs → SLA. Lets the agent produce a personalised checklist ("seller abroad + buyer local → GPA path") |
| **T4. Forms & templates** | ~75 forms, affidavits, undertakings, specimens | ~75 | "Send me the form for…", explain how to fill each field, stamp-paper value, attestation authority | **Form catalogue** (`form_id, title, purpose, used_in_procedure[], who_signs, stamp_paper_value_by_region, attestation, submit_to, download_url`). Deliver the original download link |
| **T5. Directory / routing data** | Contact Numbers page, footer, form footers | ~150 entries | "Who do I call about NDC?" → Fin Dte ext 1238 | Structured directory keyed by **topic → role → extension/email**. Store roles, not personal names (see §8) |
| **T6. Transactional entry points** | Utility and water bill (Consumer ID), Resident email info, Sale/Purchase/Subscribe forms, Contact-us form, Member portal signup/login, Margalla ballot | ~10 | Hand off or deep-link now; act through a tool later | Register as **tools / deep links**. Bill lookup by Consumer ID is the best first API integration |
| **T7. Time-bound notices & news** | News feed (surcharge rates Jul–Dec 2026, Caveat Emptor, bowser advisory), Important Notices (41 images), Other Activities, Blacklisted gallery | Dynamic | "Any new notices?", warnings (blacklisted dealers), current surcharge | Scheduled re-crawl, **expiry dates** on each item, OCR for image notices. Never present an expired notice as current |

---

## 5. Process Catalogue (Structured Extraction Example)

This is the structure the agent should hold for each procedure. It is shown here for transfers, the highest-volume service.

### 5.1 Common transfer backbone (all types)
1. **Collect the transfer document set** at the Finance desk (GPA cases: T&R reception).
2. **Request Statement of Dues** (form *Request for Statement of Dues 2022*), signed by the seller. Attach the allotment letter copy, attested CNICs of both parties, and an authority letter if the seller is absent. Finance quotes the dues in **2–3 hrs**. Dues are valid for **15 days**.
3. **Pay dues** by pay order or draft (Askari Bank). No cash, no cheque, no out-station pay orders.
4. **Request NDC** (form *Request for NDC 2022*: paid challan, 236C/236K advance-tax CPRs, PSID, stamp duty challan for the Rawalpindi side). NDC is issued in **24–48 hrs** and is valid for **3 months**.
5. **Submit papers at the Legal Desk.** Legal scrutinises them, flags errors, then fixes the **transfer time and number** (first come, first served, usually the next day).
6. **Execute the transfer** in front of the Transfer Officer (physical presence required).
7. **Collect the allotment letter** on the given date. Urgent, courier and authority-letter options are available.

### 5.2 Type-specific deltas

| Transfer type | When used | Additional documents | Type-specific fee |
|---|---|---|---|
| **Normal (sale)** | Both parties present | Seller transfer affidavit; purchaser undertaking; agreement to sell; purchaser membership form + 2 photos; CNICs of parties, NOK and 2 witnesses | Transfer fee by size (SOC) + membership fee |
| **Gift / Hiba** | Love and affection, typically family | Gift deed; donor affidavit; donee acceptance (Rs 20 stamp) + undertaking; certificate by donee | Transfer fee **50%** of normal; MS fee same as sale |
| **Legal heir / Widow** | Member deceased | Succession certificate / Varasat Nama / declaratory decree; NADRA FRC; death certificate; surrender affidavit from **each** heir; guardianship certificate if minors; **approval letter from T&R first**, plus GHQ W&R Dte transfer letter for GHQ-allotted plots | Transfer fee **20%** of normal; MS fee Rs 6,000 |
| **GPA** | **Owner abroad only** (local GPAs not accepted) | GPA attested by Pakistan embassy → verified by Foreign Office → registered with Registrar → DHA approval; validity certificate of GPA | GPA approval fee per plot |
| **SPA** | Purchaser leaving Pakistan, or purchaser abroad | SPA on judicial stamp paper (local) or via Pakistan mission + Foreign Office (abroad) | SPA approval fee; Rs 5,000 if the attorney collects the allotment letter |
| **Outstation** | Disabled, 65+, or member unable to attend | Medical certificate where applicable | Station-based fee + team travel, boarding and lodging |

### 5.3 Region-dependent rule the agent must apply

Stamp-paper values depend on whether the property is in the **Capital Territory (Islamabad)** or the **Province (Punjab, Rawalpindi)**:

| Instrument | Islamabad (Capital) | Rawalpindi (Provincial) |
|---|---|---|
| Affidavit / undertaking | Rs 20 | Rs 50 |
| Agreement to sell / Gift deed | Rs 100 | Rs 1,200 |

The Security form indicates the split **DHA Rawalpindi = Ph I, III, IV** and **DHA Islamabad = Ph II, V**. Get DHA to confirm this phase-to-jurisdiction mapping (and how Ph VI, VII, Valley and Sector F fit) before the agent relies on it.

---

## 6. ⚠️ Data Quality: Version Conflicts (Critical)

The same fee or time limit appears with different values across sources. **These are the specific risks of feeding the website to an LLM as-is.**

| Item | FAQ page (live) | Procedure docs (2018 era) | Schedule of Charges (wef 01 Dec 2022) | Latest notice |
|---|---|---|---|---|
| Outstation transfer fee | Rs 15,000 | Rs 15,000 | Rs 50,000 Isb/Rwp; Rs 100,000 other cities; Corp Rs 150,000 | **Aug 2026:** Rs 35k / 70k (normal); Rs 25k / 60k (disabled or 65+) |
| Urgent allotment letter | 24h Rs 10,000; 72h Rs 5,000 | Same | **24h Rs 30,000; 72h Rs 15,000** | n/a |
| Urgent transfer fee | Rs 35,000 (1 day) / Rs 15,000 (2 days), "wef 25 Jun 06" | n/a | **Rs 50,000** individual; Rs 60,000 corporate | n/a |
| Duplicate allotment letter | Rs 10,000 | Rs 20,000 | **Rs 25,000** | n/a |
| SPA approval fee | n/a | Rs 15,000 | **Rs 25,000** | n/a |
| NOC / lien marking (mortgage) | n/a | Rs 10,000 each | **Rs 12,500** individual; Rs 25,000 corporate | n/a |
| Re-issue of dues / NDC | Rs 5,500 | n/a | **Rs 8,000** | n/a |
| Membership fee (conversion) | Rs 27,500 | Rs 60,000 (Valley conversion doc) | **Tiered Rs 30k–150k** by size and category | n/a |
| Allotment letter after transfer | 20 working days | 7 working days | n/a | n/a |
| Address / domain on forms | n/a | Legacy forms: *Jinnah Avenue*, `dhai.com.pk` | n/a | Current: *Defence Avenue*, `dhai-r.com.pk` |

**Recommendations**
- Build **one authoritative fee table** with `effective_from`. Precedence: **latest dated notice > Schedule of Charges 2022 / Byelaws 2022-23 Ch III > procedure docs > FAQ**. Get sign-off from the Finance Dte.
- Tag every chunk with `doc_date`, `version`, `status (current | superseded | unknown)`. Exclude superseded chunks from retrieval, or label them clearly.
- **Fee answers should carry a disclaimer:** *"as per Schedule of Charges wef 01 Dec 2022; confirm the final amount on your Statement of Dues."* The Statement of Dues is the binding figure.
- Report the conflicts back to the DHA web team. The FAQ page needs updating whatever the agent does.
- Also note: a **Revised Surcharge Rates notice (31 Jul – 31 Dec 2026)** appears in News. It was not among the downloaded files and should be added.

---

## 7. Gaps and Missing Content

| Gap | Impact | Recommendation |
|---|---|---|
| **23 scanned PDFs have no text**, including the Schedule of Charges, Collection of Allotment, Burial SOP (COVID), Servant pass, Possession form, NDC form, Transfer application | The most important fee data is unreadable to a standard pipeline | OCR plus **manual verification** of the fee table (I transcribed the SOC visually for this analysis) |
| Important Notices (41 images), Blacklisted gallery, Advertisements | Image-only content can't be retrieved | OCR, with human review; store structured (`title, date, expiry, phase`) |
| Not downloaded yet: **PVBM.pdf** (price valuations), **Margalla Orchards Conversion Process**, Margalla Enclave Ballot, News items, About, T&C, Affiliates, Facilities sub-galleries, Phase I–VII pages | Missing answers on valuation, ballots and new projects | Add to the crawl list |
| "Other Activities" was saved without its `.html` file (only the `_files` folder exists) | n/a | Re-save the page, or crawl it live (reviewed live for this report) |
| Member Portal Guide is a video only | Agent can't explain portal usage | Ask DHA IT for a text guide, or transcribe the video |
| No phase/sector maps or structured data on plots, sectors, amenities | Can't answer "which sector is X in" or "nearest clinic" | Comes from the GIS/master-plan source later |
| No published SLAs for complaints, utility connection or completion certificate | The agent can't set expectations | Source from the directorates |
| Thin coverage of the complaint process (only number 1092) | Complaints will be a major intent | Integrate the Complaint Management System later |
| Nothing on schools, clubs or medical services beyond names | Lifestyle questions go unanswered | Facilities sub-pages, plus the mobile app source |
| No Urdu content | Many residents prefer Urdu or Roman Urdu | The agent should answer in Urdu or Roman Urdu from the English sources; keep a glossary (Varasat Nama, Hiba, NOK, NDC, MS No …) |

---

## 8. Sensitive Content and Guardrails

1. **Staff names and personal mobile numbers** on `/contact-no/` (Recovery Cell, Margalla Enclave sales, security officers, coaches). The agent should give **role + office extension + department email** by default. Personal mobiles should be shared only where DHA explicitly approves (e.g. graveyard and security control rooms for emergencies).
2. **Watermark "Viewed by 871arslan …"** appears on the E-Tag PDFs (Resident, Frequent Visitor, Ex-Bahria, Non-resident). Strip it before re-serving, or ask DHA for clean originals.
3. **Bank account numbers** (e.g. DHA Misc Gen Fund A/C on the rent challan and E-Tag forms). Serve only from the verified table, and never let the model generate them. Account-number fraud is a common real-estate scam vector.
4. **Blacklisted parties.** Statements about a named person or firm being blacklisted must come verbatim from the official, dated list.
5. **Caveat Emptor and fraud.** The agent should warn about buying through unregistered dealers and give the official verification route (Plot Verification Form, Certificate Verification fee).
6. **Legal and financial advice boundary.** The agent explains DHA procedure. It does not give legal advice on succession disputes, tax liability (236C/236K) or property valuation. It refers those to the relevant desk or a professional.
7. **PII in chat.** The public-site agent should not collect CNIC, membership number or allotment details until the authenticated member-portal integration exists.

---

## 9. User Personas Served by This Source

| Persona | Top needs met by website content |
|---|---|
| Plot owner / member (seller) | Transfer steps, dues/NDC, fees, documents, GPA from abroad |
| Buyer | Membership, verification, undertaking, agreement to sell, fraud warnings |
| Legal heir / widow | Succession docs, surrender affidavits, approval flow, reduced fees |
| Overseas member | GPA/SPA through the embassy, courier collection, NICOP/POC rules |
| Resident owner | E-Tag, car sticker, servant pass, CCTV request, burial SOP, bills, complaints |
| Landlord / tenant | NOC for renting and vacating, police verification, tenant E-Tag |
| Builder / owner constructing | Possession, site plan, drawing approval, byelaws, registered professionals, green cloth, solar |
| Professionals / contractors / vendors / dealers | Registration criteria, forms, fees, renewals |
| DHA Valley / Own-project allottee | File opening, certificate endorsement, conversion to allotment letter |
| Prospective investor | Sales lounge, price valuation, marketplace, ballots |

---

## 10. Sample Intents the Agent Can Handle From This Source

| Intent | Example user query | Sources used |
|---|---|---|
| Transfer checklist | "Mein apna plot apne bhai ko gift karna chahta hoon, kya documents chahiye?" ("I want to gift my plot to my brother. What documents do I need?") | Gift procedure, Gift deed, Donor affidavit, SOC (50% fee) |
| Fee calculation | "Transfer fee for a 500 sq yd plot, normal sale?" | SOC table → Rs 100,000 + MS fee Rs 75,000 + Masjid fund Rs 12,000 (indicative; Statement of Dues is binding) |
| Overseas sale | "I live in Canada and want to sell my plot." | GPA procedure, GPA fee, outstation option |
| Form request | "Servant pass form?" | Form catalogue → download link + documents list + Rs 30 lamination |
| Construction rule | "Construction time limit at night?" | Byelaws 7.3 → 7 pm winter / 9 pm summer |
| Tenancy | "How do I rent my house?" | NOC Security Dte form, police verification, female-tenant rule |
| E-Tag | "Visitor e-tag charges?" | Visitor E-Tag form → Rs 1,200, 1-year validity |
| Routing | "Who handles NDC?" | Directory → Fin Dte, ext 1238 |
| Burial | "Is a plot-only member eligible for the DHA graveyard?" | SOP Burial → No, residents with own property only |
| Bill | "Show my water bill." | Hand off to `/water-bills/` (Consumer ID); later via API |

---

## 11. Recommended Knowledge Architecture (for Source #1)

```
                       ┌─────────────────────────────┐
  Crawl + downloads ──►│ Ingestion                   │
                       │  • text extract / OCR       │
                       │  • de-dup (13 groups)       │
                       │  • strip watermarks         │
                       │  • date/version tagging     │
                       └────────────┬────────────────┘
          ┌───────────────┬─────────┼──────────────┬────────────────┐
          ▼               ▼         ▼              ▼                ▼
   Byelaws/Policy   Fee Table   Process Graphs  Form Catalogue   Directory
   (vector index,   (SQL/JSON,  (steps, docs,   (metadata +      (topic→role→
   clause-chunked)  versioned)  SLA, fee refs)  original URLs)   ext/email)
          └───────────────┴─────────┬──────────────┴────────────────┘
                                    ▼
                         Agent (LLM + tools)
     tools: search_policy · get_fee · get_procedure · get_form · find_contact
            · latest_notices · [future] get_bill · get_dues · track_transfer
```

**Chunking guidance**
- Byelaws: one chunk per numbered clause (e.g. `8.47 Construction Period`). Metadata: `part, chapter, directorate, clause_no, page`.
- Procedures: one chunk per procedure, also parsed into structured steps.
- Forms: index the purpose and instructions sections, not the blank fields.

**Freshness**
- Weekly re-crawl of News, Important Notices, Other Activities and Downloads, with a diff alert when a PDF hash changes.
- Each fee row has `effective_from` / `effective_to`.

---

## 12. Integration Hooks for Later Sources

| Website entry point | Future source / integration | Agent upgrade |
|---|---|---|
| Utility bill / Water bill (Consumer ID) | Billing API | Fetch bill, due date, pay link |
| Member Portal (member.dhai-r.com.pk) | Authenticated member APIs | Personal dues, plot list, transfer status, statements |
| Request for Statement of Dues / NDC | Finance ERP | Real dues instead of indicative fees |
| Complaints 1092 | Complaint Management System | Log and track complaints |
| E-Tag / passes | Security system | Status of E-Tag or pass applications |
| Resident email info form | CRM | Update contact details |
| Mobile App | App content + push notices | Same notices, consistent answers |

---

## Appendix A: Duplicate Files (byte-identical)

| Keep | Duplicate(s) |
|---|---|
| 19-Special-Power-of-Attorney.doc | Special-Power-of-Attorney-Specimen.doc |
| 18-General-Power-of-Attorney.doc | General-Power-of-Attorney-Specimen.doc |
| Application-Form-for-Transfer-of-Plot.pdf | …_ghouMT0.pdf |
| Issuance-Of-NDC-No-Demand-Certificate.pdf | …_bpNOh5x.pdf, …_deaSWmN.pdf |
| Request_for_Statement_of_dues_for_house-shop_and_Plot.pdf | …_1.pdf |
| 8-Normal-Transfer-Procedure.doc | Normal-Transfer-Procedure-jul20181.doc |
| 9-Gift-Transfer-Procedure.doc | Gift-Transfer-Procedure-jul2018.doc |
| 10-Widow-Legal-Heir-Transfer-Procedure.doc | Widow-Legal-Heir-Transfer-Procedure.doc |
| 11-GPA-Transfer-Procedure.doc | GPA-Transfer-Procedure-jul2018.doc |
| 12-SPA-Transfer-Procedure.doc | 5.doc |
| 15-Application-For-Legal-Heir-Transfer.doc | Application-by-Widow-Widower-Legal-Heir-jul2018.doc |
| 17-Affidavit-for-Surrender-of-Rights.doc | 3.doc |

Near-duplicates (same content, minor edits): the `-jul2018` versions of Affidavit by Seller/Donor, Undertaking by Purchaser/Donee/Widow, Agreement to Sell, and Allotment Certificate Endorsement. Also `1.doc` = Authority letter (dues/NDC) and `2.doc` = Gift Deed.

## Appendix B: Scanned PDFs Needing OCR (23)

Revised_charges_W.E.F_Dec_-2022 (5 pp, **critical**) · 4-Collection-of-Allotment-Procedure · SOPBurialCorona (3 pp) · Issuance-Of-NDC (DHAI-502F) · Police-Verfication · Application_for_Pass_Servant_Maid_and_Dvrs · APPLICATION_FOR_POSSESSION_DEMARCATION (DHAI-301T) · stamp-vendor · NOC · Appl-of-Registration-Authority (CVT-I form) · RequestRequisitionForIssuanceOfPlotAccountStatement · Authority-Ltr · 7/Application-for-Transfer-of-Plot · Application-Form-for-Transfer-of-Plot (×2) · 11-Application-for-Gift-of-Plot · Registration_Form_Contractors_Vendors · Security_Form_for_Contractor_Labour · Request_for_Statement_of_dues_for_house-shop_and_Plot (×2) · NDC duplicates (×2)

## Appendix C: Byelaws 2022 (Updated 2023), Chapter Map

| Part | Chapter | Directorate / Topic | Agent relevance |
|---|---|---|---|
| I | I | Preliminary & Definitions (Covered area, FAR, Carpet area …) | Glossary |
| I | II | Transfer & Record: oversize, extra land, amalgamation, inspection before transfer | High |
| I | III | Finance: all fee schedules (mirrors SOC 2022) | High → fee table |
| I | IV | Business Development: penalties | Medium |
| I | V | Marketing: hoardings, signage | Low |
| II | VI | Town Planning: sub-division, possession, gates, parking, corner plots | High |
| II | VII | Construction guidelines: hours, green cloth / CGI | High |
| II | VIII | Building Control: 106 clauses (plans, approvals, completion, standards for residential and commercial, solar, basement, fire safety) | Very high (largest) |
| III | IX | Administration: commercial activity, masjids, noise, pets, graveyard, vacant plots | High |
| III | X | Environment: horticulture, pollution, debris | Medium |
| III | XI | Services/Maintenance: meters, water, bowsers, sewerage, complaints, seepage | High |
| III | XII | Security: renting, passes, E-Tag, parking, fireworks, car washing | High |
| III | XIII | IT: mobile app registration, BTS antennas, QR codes | Medium |
| IV | XIV | Regularization charges | Medium |
| IV | XV | Fines by directorate | High |
| IV | XVI | Forms & annexures | Form catalogue |
