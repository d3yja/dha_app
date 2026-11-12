# DHAI-R Agent Data: First Draft (from public website)

These 22 CSV files were built from the documents in `D:\codes\DHA` and the live website https://www.dhai-r.com.pk/ (checked 29 Oct 2026).
They are a **first draft and a template**: the DHA team should review, correct and take over maintenance.
Files are UTF-8 with BOM, so Urdu text and Excel both work.

## Files

| # | File | Priority | Rows | Key column | Main gaps |
|---|---|---|---|---|---|
| 01 | service_catalogue | 1 | 58 | service_id | Presence rules and SLAs unknown for several services |
| 02 | fees_charges | 1 | 181 | fee_id | Schedule of Charges was scanned and transcribed manually; needs Finance sign-off. Superseded values are kept as separate rows |
| 03 | procedure_steps | 1 | 128 | procedure_id + step_no | Account statement, amalgamation and solar steps not published |
| 04 | document_requirements | 1 | 155 | procedure_id + document_name | Attestation level of CNIC copies not always stated |
| 05 | forms_catalogue | 1 | 89 | form_id | Some forms are only on Valley / Transfer pages (URL pattern assumed) |
| 06 | contacts_directory | 1 | 73 | contact_id | Roles only, **no staff names**. Rows marked `internal_review` hold personal-looking mobiles |
| 07 | phases_jurisdiction | 1 | 16 | phase_id | **Islamabad/Rawalpindi split per phase must be confirmed** (drives stamp paper and payee) |
| 08 | stamp_paper_rules | 2 | 23 | rule_id | |
| 09 | sla_validity | 2 | 23 | sla_id | Allotment letter time conflicts (7 vs 20 working days) |
| 10 | eligibility_rules | 2 | 30 | rule_id | |
| 11 | fines_penalties | 2 | 74 | fine_id | From Bylaws Ch XV (2023) |
| 12 | regularization_charges | 2 | 25 | reg_id | From Bylaws Ch XIV |
| 13 | building_standards | 2 | 51 | std_id | Covered-area % for 601–800 sq yd and first-floor rules for 400+ sq yd unreadable (merged cells) |
| 14 | offices_counters | 3 | 20 | office_id | Working hours mostly unpublished |
| 15 | payment_channels | 3 | 9 | pay_id | **Restricted.** Bank account numbers must be verified by Finance before use |
| 16 | registered_professionals_vendors | 3 | 0 | reg_no | **Header only**: not published on the website; DHA must supply |
| 17 | blacklisted_entities | 3 | 0 | entity_id | **Header only**: website shows images only; DHA must supply |
| 18 | facilities_amenities | 3 | 21 | facility_id | Locations and timings missing |
| 19 | projects_master | 3 | 12 | project_id | Phase VI/VII details missing |
| 20 | notices | 4 | 26 | notice_id | News item text and 41 image notices not captured (`needs_content`) |
| 21 | faq_approved_answers | 4 | 25 | faq_id | **Draft answers**, all need DHA approval |
| 22 | glossary | 4 | 58 | term | |

## How the files link

```
01 service ──procedure_id──► 03 steps ──fee_ids──► 02 fees
     │                          │
     ├──form_ids──► 05 forms ◄──┴── 04 documents (form_id), 08 stamp rules (form_id)
     ├──fee_ids───► 02 fees
     └──service_id◄── 09 SLA, 10 eligibility, 21 FAQ
07 phases ── jurisdiction ──► 08 stamp paper value, 15 payee
```

In `fee_ids`, a `*` means "all matching rows". For example, `TFR-RES-NOR-*` covers every residential normal-transfer size band.

## Status values (every file)

| Status | Meaning for the agent |
|---|---|
| `current` | Safe to use |
| `needs_confirmation` | Use with a caveat; DHA to verify |
| `superseded` | History only; never quote as current (`effective_to` is filled) |
| `missing` / `needs_content` | Placeholder; information not available from the website |
| `draft_needs_dha_approval` | FAQ answer written from sources; needs DHA approval |
| `expired` | Notice past its expiry date |

## Known conflicts resolved in favour of the latest source

Outstation fee (Aug 2026 notice), urgent allotment letter, urgent transfer, duplicate allotment letter, SPA fee, mortgage NOC/lien, re-issue of dues/NDC, extra land categories, membership card fee and plot verification fee all follow the **Schedule of Charges wef 01 Dec 2022**. The older FAQ and procedure values are kept as `superseded` rows in `02_fees_charges.csv`.
