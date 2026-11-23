# Gulmohar Analytics --- Local Configuration

**Document type:** Local development configuration and technical
reference\
**Audit date:** 21 November 2026\
**Project:** `gulmohar-analytic-dashboard`\
**Audited branch:** `dev`\
**Audited commit:** `2e863b8381c4e5a5513829d095b322a63cf40645`\
**Commit message:**
`Add preparation tracking and improve wastage, breakage and manager access`

> Scope: This document records local findings only. It does not describe
> or assume the current VPS state. Secret values are intentionally
> excluded. Findings are based on the local audit report supplied in
> this conversation and should be re-verified before future deployment
> work.

## 1. Local environment

  Setting             Audited value
  ------------------- ----------------------
  Operating system    Windows
  Runtime             Node.js 20
  Git branch          `dev`
  Git commit          `2e863b8`
  Database            PostgreSQL 16
  Database host       `localhost`
  Database port       `5432`
  Database name       `gulmohar_dev`
  ORM                 Prisma
  Application stack   Next.js / TypeScript

The local development project is the intended environment for
implementing and validating changes before considering production
deployment.

## 2. Git state

-   Branch: `dev`
-   Commit: `2e863b8381c4e5a5513829d095b322a63cf40645`
-   Commit message:
    `Add preparation tracking and improve wastage, breakage and manager access`

This is the commit recorded at audit time, not a guarantee of the
current working-tree state. Re-check `git status`, branch and commit
before starting work.

## 3. Local PostgreSQL and Prisma

### Connection

  Setting                Value
  ---------------------- ----------------
  Engine                 PostgreSQL 16
  Host                   `localhost`
  Port                   `5432`
  Database               `gulmohar_dev`
  Environment variable   `DATABASE_URL`

The actual connection string is intentionally omitted.

### Migration state

The local audit reports seven migrations applied, through:

`20261121024835_add_master_data_breakage_and_reasons`

Always verify the current migration state with Prisma before running
migrations or deployment tasks.

### Sales tables

The local database contains:

-   `sales_orders`
-   `sales_order_items`

At audit time, both were empty:

  Model/table          Record count
  ------------------ --------------
  `SalesOrder`                    0
  `SalesOrderItem`                0

No Petpooja sales orders had been imported into local PostgreSQL at the
time of the audit.

### Outlet mapping

The local outlet `KOZ-001` exists. Its Petpooja mapping was reported as:

  Field              Value at audit time
  ------------------ ---------------------
  Outlet code        `KOZ-001`
  `petpoojaRestId`   `null`

The audit identified this as a prerequisite for resolving the Petpooja
restaurant to the local outlet during ingestion. Do not update it
automatically; first confirm the intended outlet and approve the
local-only change.

## 4. Local environment variables

The audit reported these variables in the local `.env`. Values are not
reproduced.

  --------------------------------------------------------------------------------
  Variable                         Purpose                 Status at audit time
  -------------------------------- ----------------------- -----------------------
  `DATABASE_URL`                   Local PostgreSQL        Configured
                                   connection              

  `PETPOOJA_GET_ORDERS_ENDPOINT`   Get Orders endpoint     Configured
                                   override                

  `PETPOOJA_REST_ID`               Petpooja restaurant     Configured
                                   identifier              

  `PETPOOJA_APP_KEY`               Petpooja application    Configured
                                   key                     

  `PETPOOJA_APP_SECRET`            Petpooja application    Configured
                                   secret                  

  `PETPOOJA_ACCESS_TOKEN`          Petpooja access token   Configured

  `PETPOOJA_API_COOKIE`            API cookie used by the  Configured
                                   current client setup    

  `PETPOOJA_WEBHOOK_TOKEN`         Optional webhook        Not configured
                                   verification token      

  `SUPABASE_URL`                   Legacy webhook staging  Not configured
                                   configuration           

  `SUPABASE_SECRET_KEY`            Legacy webhook staging  Not configured
                                   configuration           
  --------------------------------------------------------------------------------

**Security:** Never commit `.env` or copy credential values into
documentation, prompts, logs or issue trackers. Keep `.env.example`
limited to variable names and safe placeholders.

## 5. Existing Petpooja source files

The local audit identified these files:

  ------------------------------------------------------------------------------
  File                                       Responsibility
  ------------------------------------------ -----------------------------------
  `src/lib/petpooja/get-orders-client.ts`    Calls the Get Orders API; handles
                                             request configuration,
                                             authentication, pagination and
                                             errors/retries.

  `src/lib/petpooja/normalizer.ts`           Normalizes order data, timestamps
                                             and decimal values; removes
                                             customer PII.

  `src/lib/petpooja/resolver.ts`             Resolves Petpooja outlet and
                                             matches external menu items to
                                             internal products.

  `src/lib/petpooja/ingestion-service.ts`    Writes normalized orders and order
                                             items to PostgreSQL using Prisma
                                             transactions/upserts.

  `src/lib/petpooja/sync.ts`                 Orchestrates the client,
                                             normalizer, resolver and ingestion
                                             service for a requested date.

  `src/lib/petpooja/validator.ts`            Validates relevant Petpooja payload
                                             structure.

  `src/lib/petpooja/logger.ts`               Structured logging with
                                             sensitive-data sanitisation.

  `src/app/api/webhooks/petpooja/route.ts`   Legacy push/webhook receiver route.
                                             Its storage path must be
                                             distinguished from the PostgreSQL
                                             pull pipeline.

  `scripts/test-petpooja-pull.ts`            Standalone script for controlled
                                             Get Orders pull testing.
  ------------------------------------------------------------------------------

### Pull pipeline

The existing pull-based flow is:

1.  Get Orders client requests order data from Petpooja.
2.  Normalizer converts the response to the application's internal
    format and removes customer PII.
3.  Resolver maps the Petpooja restaurant/outlet and attempts to match
    external menu items to internal products.
4.  Ingestion service writes orders and order items to local PostgreSQL.
5.  Sync orchestrator coordinates the complete flow.

The audit describes transactional upserts using the outlet and Petpooja
order identifier, intended to make repeat imports idempotent.

### Product matching

The audit describes matching using external item identifiers and product
attributes, including item code, barcode and exact name. Unmatched sales
lines are retained with a nullable internal `productId`, rather than
blocking ingestion.

This is relevant to the menu catalogue requirement: order ingestion can
preserve sales lines even when an internal product match is unavailable.
A complete menu catalogue and reliable external-ID mapping remain a
separate requirement to verify with Petpooja.

## 6. Get Orders API reference

The integration audit records this endpoint:

`https://api.petpooja.com/V1/thirdparty/generic_get_orders/`

Method: `POST`\
Content type: `application/json`

Request fields recorded in the audit:

-   `app_key`
-   `app_secret`
-   `access_token`
-   `restID`
-   `order_date`
-   `refId`

Do not place actual credential values in this document.

### Pagination and date handling

The Petpooja information supplied to the project describes continuing
pagination with the `refId` from the last order in the preceding
response. The audit reports pagination handling and repeated-cursor
safeguards in the client.

**Verification note:** Before relying on the client for a live
ingestion, compare its exact request and response handling with the
latest Petpooja documentation and the support clarification received.
The supplied audit materials contain differing descriptions of
pagination in different places; verify the current source code against
the provider's confirmed behaviour.

The business requirement is to retrieve the previous day's completed
sales, not live sales. Date handling must respect Petpooja's
operational-day behaviour and the actual `Order.order_date` returned. Do
not assume a requested date always represents exactly one calendar date,
particularly for historical queries.

## 7. Tests and local sample data

The audit identifies these test suites:

-   `tests/petpooja-get-orders-client.test.ts`
-   `tests/petpooja-normalizer.test.ts`
-   `tests/petpooja-resolver.test.ts`
-   `tests/petpooja-ingestion.test.ts`
-   `tests/petpooja-sync.test.ts`

A local sample response reference exists at:

`docs/petpooja-data.md`

The audit describes it as a sample Petpooja response containing 100
orders. It can be used to inspect response structure without making
another live API request.

The presence of test suites does not prove that a live API pull has
populated the local database. At audit time, the sales tables were
empty.

## 8. Legacy webhook route

The repository contains:

`src/app/api/webhooks/petpooja/route.ts`

The audit describes this as a legacy webhook/staging route associated
with an earlier Supabase-based approach. However, the local audit
reports `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as not configured
locally.

The primary pull-based Get Orders pipeline is described as writing
directly to PostgreSQL and not depending on Supabase.

Do not assume the webhook route is part of the active operational
ingestion flow. Before modifying or removing it, inspect its current
code, references and deployment usage.

## 9. Scheduled ingestion

At audit time:

-   No local cron job or background worker was identified for automatic
    Petpooja ingestion.
-   The pull script/orchestrator can be invoked on demand.
-   Automated daily retrieval remains pending.

The schedule and operational-day cutoff should be agreed before
implementing a scheduler. The intended behaviour is one scheduled daily
retrieval of the previous day's data, with a safe retry or re-fetch
process where needed.

## 10. Local status and outstanding work

  --------------------------------------------------------------------------
  Area                    Finding at audit time      Next action
  ----------------------- -------------------------- -----------------------
  Get Orders client       Implemented in local code  Verify exact
                                                     request/response
                                                     behaviour against
                                                     provider documentation

  Normalizer              Implemented                Run tests and validate
                                                     sample data

  Product resolver        Implemented                Review mapping rules
                                                     against menu catalogue
                                                     and external item IDs

  PostgreSQL ingestion    Implemented                Perform controlled
                                                     local test after
                                                     confirming outlet
                                                     mapping

  Sales tables            Present, empty             Verify records after an
                                                     approved test ingestion

  Outlet mapping          `KOZ-001.petpoojaRestId`   Confirm and configure
                          is `null`                  locally before live
                                                     pull

  Test suites             Present                    Run and record results

  Sample response         `docs/petpooja-data.md`    Use for offline
                                                     validation

  Daily scheduler         Not implemented            Design after successful
                                                     local ingestion

  Complete menu catalogue Not established by Get     Await Petpooja's
                          Orders order history       response on API/export
                                                     availability

  VPS parity              Not established by this    Verify directly on VPS
                          local document             and compare separately
  --------------------------------------------------------------------------

## 11. Recommended local verification sequence

These are proposed tasks, not actions already completed:

1.  Check current Git branch, commit and working-tree status.
2.  Confirm required variable names are configured locally without
    printing values.
3.  Check Prisma migration status against `gulmohar_dev`.
4.  Inspect `get-orders-client.ts` and compare it with Petpooja
    documentation and support clarification.
5.  Run the existing Petpooja unit tests.
6.  Confirm the intended local outlet and its `petpoojaRestId`.
7.  Perform a controlled dry run first, if supported by the current
    script.
8.  Review dry-run output before approving any database ingestion.
9.  Verify order counts, item counts, duplicate handling, date filtering
    and financial totals after an approved test.
10. Record test results and discrepancies in the integration audit.

Do not run live ingestion or modify the local database without explicit
approval.

## 12. Related project files

  ---------------------------------------------------------------------------------------
  File/path                                           Purpose
  --------------------------------------------------- -----------------------------------
  `docs/integrations/PETPOOJA_INTEGRATION_AUDIT.md`   Cross-environment integration audit
                                                      and comparison reference

  `docs/petpooja-data.md`                             Sample Petpooja response data

  `src/lib/petpooja/`                                 Pull integration implementation

  `scripts/test-petpooja-pull.ts`                     Local pull test script

  `tests/`                                            Petpooja integration test suites

  `.env.example`                                      Safe reference for environment
                                                      variable names
  ---------------------------------------------------------------------------------------

## 13. Audit limitations

This is a snapshot of local findings reported on 21 November 2026, not a
live inspection of the current machine.

The audit did not establish that:

-   A live Get Orders pull has successfully populated local PostgreSQL.
-   The local outlet mapping has been corrected.
-   A daily scheduler exists.
-   The complete Petpooja menu catalogue can be retrieved through the
    currently implemented Get Orders API.
-   Local and VPS environments are currently identical.

Re-check the repository, local environment variable presence, Prisma
migration status and database state before relying on this document for
future development or deployment.
