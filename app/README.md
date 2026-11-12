# DHA Resident Help (prototype)

A mock web app that shows how an agentic help and complaints service could work for DHA Islamabad-Rawalpindi residents and members. It is designed for older and non-technical users: big buttons, plain English, few choices per screen, and a "talk to a person" bar on every page.

General answers come from the 22 CSV files in `../data` (built from the public website). Personal screens (complaints, property, installments, bills) use demo data: five demo people, and a CMS stub loaded with the 7,826 complaints in `../samples/Complaints.csv`. CNIC is the one ID across every portal and the CMS.

**Main goal:** move complaints from the call center to the app. A resident types the problem in their own words; the app fills everything the CMS needs from their profile, asks only what is missing, checks for duplicates, files it in the CMS and keeps them updated.

## Run it

Needs Node.js 18 or newer. No packages to install.

```bash
cd D:\codes\DHA\app
node core/seed.js
node server.js
```

Open http://localhost:5173 and use **Sign in** (top right) to pick a demo person. `core/seed.js` builds `store/core.sqlite` and `store/cms_stub.sqlite`; run it again (or **Settings > Reset demo data**) for a clean demo. If you change `../samples/Complaints.csv`, first run `node ../pipeline/build_cms_templates.js`.

## What residents can do

| Screen | What it shows |
|---|---|
| Home | Signed in, the top of the home screen is **For you today**: what needs this person's attention (a bill to pay, overdue instalments, a fee voucher, a complaint waiting for "Is it fixed?", missing documents), each with one button |
| Ask a question | Chat assistant. Shows which sources it checked, then answers with cards: steps, fees (with a Marla/Kanal picker), forms, tap-to-call numbers |
| How do I…? | 10 plain-language topics, then each service with steps, document checklist (tick and print), stamp paper, fees, timings, forms and contacts |
| Report a problem | Guided chat (sign-in needed). The resident writes in English, Roman Urdu or Urdu, or taps a common problem. See "Complaint intake" below |
| My complaints | Own and followed complaints, live from the CMS, with the CMS timeline. Add information, cancel, and answer "Is it fixed?" when the team marks it resolved |
| Notifications | Bell in the top bar. Every CMS status change arrives here (and as a toast); resolved complaints carry Yes, fixed / Not fixed buttons |
| Buy a plot | DHA Marketplace (simulated): DHA-owned plots by phase, type, size and budget; plot page with price, market price range and payment plans; book with a token, pay the down payment, become a member. See "Marketplace" below |
| Build a house | Construction guidance for the signed-in member's plot, or any plot size: what can be built (covered area, setbacks, height), the 8 steps from possession to moving in with fees worked out for the size, fines to avoid, regularization charges. Members tick steps off as they go. See "Construction guidance" below |
| My account | Member portal: plots, membership, payment plan with overdue installments and full schedule. Resident portal: society bills and payment history, and **Pay this bill** (demo payment with a receipt and a notification) |
| Track a complaint | Public lookup by complaint reference or mobile, no sign-in |
| Phone numbers / Forms | Searchable directory and form downloads |
| اردو / English | Button in the top bar. Every resident screen in Urdu, right to left. See "Urdu" below |

### Demo people

| Person | Shows |
|---|---|
| Ayesha Khan | Prospect with no property: complaints are politely refused, account shows "no property yet" with a link to plots for sale. Buying a plot makes her a member |
| Bilal Ahmed | Member, empty plot in Phase 6, two installments overdue (the dates move with each reset, so it is always two) |
| Sana Malik | Owner-builder, fully paid 10 Marla plot in Phase 2: site plan issued and possession ticked; her building plan has a fee voucher to pay, and drawings are the next step |
| Imran Qureshi | Resident of Phase 2, Sector E, Street 3: past complaints, an electrician job in progress, one bill to pay; a neighbour reported "no water" on his street an hour ago |
| Farah Siddiqui | Resident of Phase 1 and member of a second plot in Phase 5; a street-light complaint waits for her "Is it fixed?" answer |

All money figures for the demo people are demo values, not DHA records.

### Demo script (about 5 minutes)

Before presenting: open **Settings > Open the demo control panel** and press **Reset demo data**. The story's dates (the neighbour's complaint "an hour ago", the bill due in 10 days, Bilal's two overdue instalments) are set at the reset. The panel warns when the data is more than 12 hours old.

1. Sign in as **Imran**. The home screen opens with **For you today**: a complaint waiting for his answer, his society bill, his open complaint.
2. Press **Pay now** on the bill, then **Pay Rs … (demo payment)**. He gets a receipt, a notification, and the bill shows as paid.
3. Report: *washroom ka flush leak kar raha hai, subah koi aa sakta hai*. No questions are asked: the type is Plumber, the visit time comes from the message, the address and mobile from his profile. Send it.
4. Open the complaint and press **Simulate field team update (demo)** twice. Watch the toast and the bell: the CMS pushed each change to the app.
5. In **Notifications**, press **Yes, fixed**. The CMS complaint is now Closed.
6. Report: *pani nahi aa raha*. The app finds the neighbour's open complaint on the same street and offers to follow it instead of filing a duplicate.
7. Report: *gas ki boo aa rahi hai kitchen mein*. Safety advice and numbers come first; the complaint is marked urgent.
8. Press **اردو** in the top bar. The whole app turns to Urdu. Report: *واش روم کا فلش لیک کر رہا ہے، صبح کوئی آ سکتا ہے*, or ask the assistant *میرا بل کتنا ہے*. Press **English** to go back.
9. Sign in as **Bilal**: the home screen shows two instalments overdue; **My account** has the schedule.
10. Ask the assistant *1 kanal plot ki qeemat phase 5*: it gives the market price range from the benchmark and links to plots for sale.
11. Sign in as **Ayesha**, open **Buy a plot**, pick Phase V, 1 Kanal. Open a plot, choose the 2-year plan and **Book**. Pay the down payment: she is now a member, and **My account** shows the plot and 8 quarterly instalments.
12. Sign in as **Sana**: the home screen shows her fee voucher. **Pay the voucher** opens Build a house with her building plan application, what she can build on 10 Marla, and the next step (drawings). Pay the voucher, then press **Demo: DHA office takes the next step** to approve the drawings. Ask the assistant *10 marla pe kitna bana sakte hain*.

Live AI needs the internet. If it is slow or down on the day, switch to **Built-in answers** in Settings: every step above still works except free-form questions in Urdu script about procedures.

## Complaint intake (`core/intake.js`)

The CMS template comes from the call-center export (`../pipeline/build_cms_templates.js` → `../data/cms_templates.json`): 84 category/sub-category pairs in 8 groups, each group with the few questions it needs.

1. **Classify** the resident's words with a naive Bayes model trained on the export's descriptions plus hand-written English and Roman Urdu keywords. Sure → use it. Unsure → show the top three. Nothing recognised → show the common types.
2. **Fill from the profile**: CNIC, membership number and type, phase, sector, street, house, coordinates, name, mobile.
3. **Check before filing**: an open complaint of their own of the same type (offer to add to it); for outages, an open complaint of the same type on their street (offer to follow it); water tanker one per 48 hours; for billing, show the latest bills first; for safety, advice and the phase control room number first, priority urgent.
4. **Ask only what is missing**: e.g. visit time for home visits, "since when / neighbours too?" for outages. Answers already in the message are taken from it.
5. **Confirm and submit** to the CMS with an idempotency key, so a double tap never files twice.

**Talk to a person** is on every step: it stores the conversation as a hand-off for the Complaint Office, so the resident does not repeat themselves. Every step is logged in `channel_log` (submitted, followed instead of filing, answered by bill lookup, hand-off) for the call-center deflection report.

## Urdu (`public/js/i18n.js`, `core/urdu.js`)

- **Screens**: the اردو button switches every resident and member screen to Urdu, right to left, in Nastaliq (Noto Nastaliq Urdu from Google Fonts, falling back to the Urdu fonts on the device). `i18n.js` holds the translations: exact strings, patterns for strings with names, amounts, dates and addresses, and the reporter's and assistant's messages. It translates text as it is added to the page, so screens need no changes of their own; anything without a translation stays in English. Switching language reloads the page.
- **Not translated**: DHA's own content (procedures, documents, fees, Byelaws, notices, form names), which is shown as DHA publishes it, with a line saying so. Settings and the demo control panel stay in English. People's names stay as stored.
- **Understanding Urdu**: `core/urdu.js` turns Urdu script into the Roman Urdu and English words the intent rules and the complaint classifier already know, so "پانی نہیں آ رہا" behaves exactly like "pani nahi aa raha". The complaint keeps the resident's own words. Words it does not know are ignored; add them to its two lists.
- **Live AI**: in Urdu mode, or when the question is in Urdu script, the model is asked to answer in Urdu, keeping office and document names in English. The answer checks are the same (amounts, phone numbers and clauses must come from DHA data). **Known limit:** free-form procedure questions typed in Urdu script are not reliable yet with the Groq Qwen model (in 4 tries: 1 good answer, 1 fell back to English, 1 missed a fee it finds in English, 1 answered about the NOC when asked about the NDC). Complaints, bills, dues, applications and "my complaints" in Urdu do not go through the model and are reliable. For the demo, ask procedure questions in English or Roman Urdu.
- **To review with DHA**: the Urdu wording, by someone who writes official Urdu. Voice input was left out.

## CMS integration (two-way REST)

The app reaches the CMS only through `core/cms_client.js`. The prototype mounts a CMS stub at `/cms/api`; set `CMS_BASE_URL` (and `CMS_API_KEY`) to point at the real CMS.

| Direction | Call |
|---|---|
| App → CMS | `GET /taxonomy`, `GET /complaints?cnic=&phase=&sector=&street=&sub_category=&open=1&updated_since=`, `GET /complaints/{ref}`, `POST /complaints` (Idempotency-Key header; 422 lists missing fields), `POST /complaints/{ref}/info`, `/feedback`, `/reopen`, `/cancel` |
| CMS → App | `POST /api/cms-events` with header `X-CMS-Key` (env `CMS_EVENT_KEY`): `complaint.status_changed` with reference, previous and new status, note, CNIC. Duplicates are ignored by event id |
| Demo only | `POST /cms/api/_sim/complaints/{ref}/advance` and `/status`: what the field team does in the real CMS |

To confirm with DHA: the `request_source` value for app complaints (the prototype sends `Resident Portal`; the export has Incoming Call, Android, iOS, Walk In) and the meaning of the `membership_type` codes.

Test the whole loop against a running server: `node core/smoke_test.js` (96 checks: the complaint loop, a marketplace purchase by Ayesha, Sana's construction checklist, the demo panel, intent-first chat, the membership portal, Urdu script, bill payment and the dates after a reset; it changes demo data, so reset it before and after).

## Membership portal (two-way REST, DHA's sample dump)

DHA's membership portal sample (`../samples/DHA_Sample_Data_n.xlsx`, 7 sheets) runs behind a stub with its own REST API, the same way as the CMS. The app reaches it only through `core/membership_client.js`; set `MEMBERSHIP_BASE_URL` (and `MEMBERSHIP_API_KEY`) to point at DHA's web services.

- `../pipeline/build_membership_sample.py` turns the workbook into `../data/membership_sample.json` (the app cannot read .xlsx). Re-run it when DHA sends a new dump.
- `membership_stub/membership.js` keeps DHA's table and column names in `store/membership_stub.sqlite`: `tbl_memrecords`, `tp_properties`, `tpbc_user_processes` (the dump's `site_plan` and `house_construction` sheets, which have the same columns), `tpbc_user_process_statuses`, `tpbc_user_process_payments`, `payment_details`.
- **CNIC**: the dump masks CNIC and mobile. DHA's rule is that CNICs are unique, so `core/seed.js` gives each of the 502 records its own demo CNIC, keeping the digits the mask shows. Members are copied into `persons`, `plots` (with the plot code and dimensions) and `memberships`, so any of them can sign in; members and residents are joined by CNIC.
- **Applications** (`core/applications.js`): status, the visible steps (`is_show_user`; "Voucher Verified" stays hidden), who has to act, the usual time for the step (medians from the dump), and fee vouchers with their charges. Shown on **Build a house** and in **My account**, and answered in chat ("where is my site plan", "pay my voucher") by the intent layer and the `get_my_applications` tool.
- **Personas**: Sana's building plan has a voucher to pay and her site plan is issued; Farah's second plot is waiting for missing documents; Bilal's site plan is held because the plot is under development.
- Payment methods come from the dump's `bank_type` values (card gateway, EFT, Roshan Digital Account, non-RDA). Paying in the app is a demo: no money moves.

| Direction | Call |
|---|---|
| App → portal | `GET /members?cnic=`, `GET /applications?cnic=` or `?membership_no=`, `GET /applications/{id}` (with visible history, vouchers and charges) |
| Portal → App | `POST /api/membership-events` with header `X-Membership-Key` (env `MEMBERSHIP_EVENT_KEY`): `application.status_changed` and `voucher.paid`. The member gets a notification. Duplicates are ignored by event id |
| Demo only | `POST /membership/api/_sim/applications/{id}/advance` (the office's next step) and `/pay` (a voucher payment) |

To get from DHA: the names behind the ID codes (process, timeline, directorate, category, area, status codes, membership number prefixes), the full status list for each process, and the real step times. Until then the app's names are its reading of the dump and are marked "DHA to confirm".

## Marketplace (`core/market.js`)

Modelled on the fields of the official DHA Marketplace listings (plot, phase, sector, size, status, token, base price, 1/2/3-year plan prices). Prices come from **PVBM-N.pdf** (DHA Property Exchange, Price Valuation Benchmarking, 1–15 Nov 2026), which DHA gave as the rate source for now.

- `../pipeline/build_pvbm_rates.py` reads the PDF (pypdf) into `../data/pvbm_rates.json`: 329 min–max prices by phase, sector, size and type. Each page's columns are written out in the script. Page 13 (Phase I commercial buildings) and page 21 (apartments) are skipped and listed in the file, so nothing is guessed. Re-run it when DHA sends a new PVBM.
- `core/seed.js` makes 340 listings from the plot rows (1–2 per sector and size). Houses, files and certificates are not listed.
- **Book**: choose a plan and pay the token (demo). The plot is held 72 hours and hidden from others. At most two open bookings per CNIC.
- **Pay**: the down payment (or the full price) creates the plot, an `Allottee` membership and the instalment schedule in `core.sqlite`, the same tables the member portal reads. The buyer gets notifications for both steps; expired holds put the plot back on sale.
- The assistant's `lookup_plot_prices` tool answers price questions from the same table, in both modes, and links to plots for sale.

Demo assumptions, all in `RULES` at the top of `core/market.js`, **to be confirmed by DHA**: listing price = lower end of the PVBM range; token 1% (minimum Rs 100,000); hold 72 hours; down payment 25%; plan mark-ups 6%, 12% and 18% for 1, 2 and 3 years (the 1-year figure matches the live listings; the others are assumed); quarterly instalments. No real payment is taken.

## Construction guidance (`public/js/build.js`)

Guidance, as agreed. The member's real site plan and building plan applications now show above the guide, from the membership portal (see above). Everything on the screen comes from DHA data already in `data/`; nothing is written by hand except the short step titles.

- **Steps**: procedure `PRC-CONSTRUCTION` (Byelaws Chapter XVI, Annex D), each step joined to its service (documents, forms, contacts), time limit and fees.
- **Limits for the plot size**: `13_building_standards.csv` (clauses 8.54.1–8.54.6): ground and first floor covered area, setbacks, storeys, height, room size, fire extinguishers, structural minimums, working hours, monsoon restriction, 3-year completion period.
- **Fees worked out for the size**: site plan (Rs 7,500 a marla), drawing scrutiny (Rs 15 a sq ft, shown for the ground floor at its limit plus the first floor where the rule is a plain number), completion certificate, water connection.
- **Fines to avoid** at each step (`11_fines_penalties.csv`, Building Control) and the residential **regularization charges** (`12_regularization_charges.csv`).
- Values DHA marked `needs_confirmation` (covered area for 1 Kanal and above) show "Please confirm with DHA". The 601–800 sq yd covered area and the first-floor rule above 400 sq yd are not readable in the Byelaws text, so the app says to ask Building Control instead of guessing.
- The member's ticks are kept in `build_progress` (`core.sqlite`), shown in My account as "3 of 8 steps done, next: …". DHA does not see them.
- The assistant's `get_building_rules` tool uses the same module in both modes; questions about basements, boundary walls, ramps or a specific violation still go to document search.

## Two agent modes (Settings, gear icon top right)

- **Built-in answers**: a rule-based planner calls the same tools. No AI service needed. Best for reliable demos.
- **Live AI**: any OpenAI-compatible endpoint chooses which tools to call. Presets for Groq, OpenRouter, vLLM, Ollama and a custom endpoint. Enter base URL, API key and model, then **Test connection**. Use a model that supports tool calling. The loop runs on the server (`agent_server.js`); the browser only sends the question. If the service fails, or its answer fails the safety checks, the app falls back to built-in answers and says so.

## Safety and abuse protection

Every message, in both modes, passes the input guard (`guard.js`) before any answer is prepared:

| Layer | What it does |
|---|---|
| Limits | 10 messages a minute and 150 a day per address, 500 characters per message |
| Split | "How do I pay bills? also write python code" is cut into separate requests |
| Rules | Known injection phrasings, fake role tags (`</system>`, `[INST]`), encoded payloads, in English and Roman Urdu |
| Prompt Guard 2 | Meta's 22M jailbreak and injection classifier, on the local model server (`/v1/classify`) |
| Scope router | Each part is compared by meaning (BGE-M3) with in-scope and out-of-scope examples in `guard/scope_examples.json` |

An attack blocks the whole message. Off-topic parts are declined by name and the DHA part is answered.

For Live AI, the server also:
- keeps the system prompt, tool list and conversation history itself (there is no open chat proxy)
- wraps the question in `<resident_question>` and tool results in `<tool_data>`, and tells the model both are data, not instructions
- makes the model answer through a `final_answer` tool with citations, and caps turns, tool calls and output tokens
- checks the answer before showing it: no code, no links outside DHA, and every phone number, rupee amount, clause number and quantity (days, feet, %) must appear in the tool data of that turn; cited ids must be real; a hidden canary detects prompt leaks

A failed check gets one corrected retry, then the built-in answer is used.

Test it with `node pipeline/guard_eval.js` (model server running): 71 real questions, 16 attacks, 14 off-topic requests, 4 mixed messages. Add real abuse you see to `guard_eval.js` and to `scope_examples.json`.

Known gap: wording that is not a number (for example "you can pay by credit card") cannot be checked this way. A groundedness model (Vectara HHEM, MiniCheck) is the next layer.

API keys are saved in `store/settings.json` on the server and are never sent back to the browser. The settings page has no login: protect it before showing the app outside a demo.

## Knowledge base and document search

Everything is built into one SQLite file, `data/dha.sqlite`:

| Part | What it holds |
|---|---|
| 22 tables | The CSVs in `data/` (services, fees, steps, documents, forms, contacts…). The app reads these instead of the CSVs when the file exists |
| `documents` | Each unique downloaded file (byte-identical copies merged), with page and OCR counts |
| `chunks` | Searchable passages: Byelaws split by clause (with chapter and section headers), other documents by paragraph, plus FAQs, fines, regularization charges, building standards and notices |
| `chunks_fts` | SQLite FTS5 keyword index (BM25) |
| `chunk_vectors` | BGE-M3 embeddings, 1024 dimensions |

How a search works (`app/retrieval.js`): keyword search and meaning search each return 40 passages → Reciprocal Rank Fusion → optionally a cross-encoder reranker (BGE reranker v2 m3) reorders the top 10 → the agent gets the top 5 with source, clause and page.

The reranker is off by default. On the 60 test questions it lifts hit@1 from 0.88 to 0.90 but takes about 9 seconds a question on a laptop CPU, against about 40 ms without it. Turn it on in **Settings > Document search** when the models run on a GPU server.

Rebuild after adding documents or editing CSVs (the app can keep running; then use **Settings > Reload DHA data**):

```bash
python -I pipeline/extract.py    # text from PDF / DOC / DOCX, Windows OCR for scanned pages
python -I pipeline/build_db.py   # chunks, FTS5 index, embeddings (cached; only new text is embedded)
node pipeline/eval.js            # retrieval accuracy on pipeline/eval_questions.json
node pipeline/guard_eval.js      # input guard: false refusals, attacks and off-topic requests let through
```

The embedding model and reranker run on the CPU through `pipeline/model_server.py` (port 5174). The app starts it automatically. Its API matches vLLM and Text Embeddings Inference (`/v1/embeddings`, `/v1/rerank`), so **Settings > Document search** can point at a GPU server instead. If the embedding or rerank service is unavailable, search falls back to keyword search and says so.

Python needs: `pymupdf python-docx numpy onnxruntime tokenizers`. Models are in `models/` (git-ignored): `Xenova/bge-m3` and `onnx-community/bge-reranker-v2-m3-ONNX`, int8 ONNX, plus `prompt-guard-2-22m` (Meta Llama Prompt Guard 2 22M, int8 ONNX from `gravitee-io/Llama-Prompt-Guard-2-22M-onnx`, Llama 4 Community Licence).

## Agent tools

Both modes use these tools (`public/js/agent.js`) over the CSV data:

`search_knowledge`, `get_service_details`, `search_documents`, `lookup_fees`, `find_contacts`, `find_forms`, `get_phase_info`, `get_latest_notices`, `start_complaint`, `track_complaint`, `lookup_plot_prices`, `get_building_rules`

`track_complaint` now reads the CMS (by reference or mobile), and `start_complaint` shows a button into the guided reporter. `get_my_account`, `get_my_applications` and `get_my_complaints` read the signed-in person's own plots, instalments, bills, site plan and building plan applications, and complaints (live AI only; the browser sends the demo CNIC and the server checks it).

### Intent first (`core/intent.js`)

Before any search or model call, the chat decides whether the person wants something **done** rather than explained, and answers those from the portals:

| Says | Answer |
|---|---|
| "I want a water bowser at my home", "plumber chahiye", "send an electrician" | The guided reporter for that service (the complaint classifier picks the CMS sub-category) |
| "street light not working", "pani nahi aa raha" | The guided reporter for that problem; gas smell, sparks or fire get safety advice first |
| "I want to pay the dues of my plot", "meri qist kitni baqi hai", "is my bill paid", "میرا بل کتنا ہے" | Their overdue and next instalments and unpaid bills; an unpaid society bill gets a **Pay this bill** button, plot dues get how to pay (15_payment_channels.csv); "sign in" if signed out, "no plot" if they have none |
| "my complaints", "status of my complaint" | Their open complaints and the ones waiting for "Is it fixed?" |

Questions *about* a service ("how do I get a water bowser", "water bowser charges", "what are the transfer dues", "I want to transfer my plot") still go to the knowledge base. It is deterministic on purpose, and runs in both modes (live: in `/api/agent` after the guard; built-in: returned with `/api/guard`). Anything it does not catch, the live model can still answer with the account tools.

## Data rules the app follows

- `superseded` fees are never shown.
- Items marked `needs_confirmation` or `draft_needs_dha_approval` show a "Please confirm with DHA" badge.
- Contacts marked `internal_review` (personal mobiles) and bank account numbers are removed by the server.
- Edit the CSVs, then use **Settings > Reload DHA data** (or restart).

## Files

```
server.js          static files, /api/kb, /api/search, /api/guard, /api/agent, settings, portal API, CMS webhook, mounts the CMS stub
core/db.js         store/core.sqlite: persons (CNIC), plots, memberships, residences, installments, bills, notifications, follows, hand-offs, channel log, marketplace listings and bookings, construction checklist
core/seed.js       builds the databases from samples/Complaints.csv, the membership dump and the five demo people
core/portal.js     member and resident portal data, notifications, CMS event handling
core/intake.js     complaint intake: classify, fill from profile, checks, questions, submit
core/market.js     marketplace: listings from the PVBM benchmark, booking, payment, allotment, price lookup
core/cms_client.js REST client for the CMS (CMS_BASE_URL)
core/membership_client.js REST client for the membership portal (MEMBERSHIP_BASE_URL)
core/applications.js site plan and building plan applications in plain words, chat answer, membership events
core/smoke_test.js end-to-end test of the complaint loop, a marketplace purchase and the construction checklist
membership_stub/membership.js  membership portal stub: DHA's sample dump in store/membership_stub.sqlite, REST API under /membership/api, events, office and payment simulator
public/js/applications.js      application cards on Build a house and My account
cms_stub/cms.js    CMS stub: store/cms_stub.sqlite, REST API under /cms/api, status events, field-team simulator
agent_server.js    live AI tool loop on the server, final_answer with citations, retries and fallback
guard.js           input guard (limits, split, rules, Prompt Guard, scope router) and output checks
guard/             scope_examples.json for the scope router
retrieval.js       hybrid search over data/dha.sqlite (FTS5 + vectors + fusion + rerank)
../pipeline/       extract.py, ocr.ps1, build_db.py, models.py, model_server.py, eval.js
public/index.html  page shell, header, talk-to-a-person bar
public/styles.css  large-type, high-contrast styles; print styles for checklists
public/js/kb.js    data loading, search with Roman Urdu synonyms, formatting
public/js/agent.js tools, simulated planner, live LLM tool loop
public/js/build.js construction guidance: steps, limits, fees and fines for a plot size (screen and assistant)
public/js/app.js   screens and routing
public/js/portal.js sign-in, home "For you today", report a problem, my complaints, notifications, my account and bill payment, buy a plot, build a house
public/js/i18n.js  Urdu for the resident screens: translations, right-to-left, dates
core/urdu.js       Urdu script to the Roman Urdu / English words the rules and classifier know
store/             settings and the two SQLite databases (created by core/seed.js)
../pipeline/build_cms_templates.js  CMS template and classifier from the complaints export
../pipeline/build_pvbm_rates.py     plot price benchmark from PVBM-N.pdf → data/pvbm_rates.json
```
