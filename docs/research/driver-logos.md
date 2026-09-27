---
library: driver-logos (vendor trademark terms for the data-source type picker)
packages: []
version: n/a (terms as published on the date researched)
researched: 2026-09-27
sources:
  - https://www.postgresql.org/about/policies/trademarks/
  - https://wiki.postgresql.org/wiki/Logo
  - https://aws.amazon.com/trademark-guidelines/
  - https://aws.amazon.com/architecture/icons/
  - https://www.mysql.com/about/legal/trademark.html
  - https://www.oracle.com/legal/logos/
  - https://www.oracle.com/legal/trademarks/
  - https://www.snowflake.com/brand-guidelines/
  - https://snowflake.com/en/legal/snowflake-site-terms/
  - https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/
  - https://about.google/brand-resource-center/guidance/
  - https://about.google/brand-resource-center/guidance/partnerships/
  - https://cloud.google.com/icons
  - https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks
  - https://learn.microsoft.com/en-us/azure/architecture/icons/
  - https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/mscle/documents/legal/intellectualproperty/trademarks/Microsoft_logo_third_party_usage_guidance_.pdf
  - https://www.dremio.com/legal/trademarks/
---
# Driver logos: vendor trademark terms, as published on 2026-09-27

## Summary

AC-338 says: "THE SYSTEM SHALL mark each driver type in the new data source wizard with its vendor's logo, where the vendor's licence terms allow wechart to show it, and otherwise with a monogram of its name." Its Fails-when adds: "shows a logo whose licence terms, as recorded in `docs/research/`, don't allow it". The feature is task T472, from proposal 1 of the 2026-09-27 designs (UX-203 in `docs/design/reviews/2026-09-27/ui-review.md`).

This doc records, for each of the eight drivers, whether the vendor's own published terms let a third-party product show the vendor's logo. The use in question is a 28 × 28 px mark on a tile in the "choose a database type" picker, next to the product name, to say which database the driver connects to, with no endorsement implied. The terms are read strictly. If they only allow diagrams or documentation, need permission or a licence, or say nothing, the verdict is "not allowed" or "not clearly allowed".

**Result: none of the eight vendors' published terms allow the logo on the picker tile. All eight tiles use the monogram.** The monograms in `packages/web/src/workspaces/data-sources/driverMarks.tsx` fit this result. A logo can be added later only if the vendor gives written permission, and that permission is recorded in a sibling doc under `docs/research/`.

Every vendor does allow its product name in plain text to identify what your software works with, so the name label beside each tile is fine. The sources are in the vendor sections below.

| Driver | Verdict for AC-338 | Conditions in the published terms | Official asset source (and its licence) | Terms source |
|---|---|---|---|---|
| PostgreSQL | **NOT CLEARLY ALLOWED**: use the monogram | The listed fair uses cover the words only. Any use not listed needs permission. The marks must not be shown with other logos. Slonik must be unmodified and in one of two approved forms. ® and an attribution line are encouraged. | [wiki.postgresql.org/wiki/Logo](https://wiki.postgresql.org/wiki/Logo): use is "subject to our Trademark Policy" | [PostgreSQL Trademark Policy](https://www.postgresql.org/about/policies/trademarks/) |
| Amazon Redshift | **NOT ALLOWED** without AWS's prior written permission: use the monogram | Fair use is "plain text only (no logos)". The Architecture Icons are for architecture diagrams and materials such as whitepapers and presentations. | [AWS Architecture Icons package](https://aws.amazon.com/architecture/icons/): for diagrams and materials, not products | [AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/) |
| MySQL | **NOT ALLOWED**: use the monogram | The only logos free to use are the conditional-use logos ("Powered by MySQL", "Includes MySQL"). Each must be a link to mysql.com and must stay out of password-protected areas. Other MySQL and Oracle logos need a signed agreement or Oracle's written authorization. | No public dolphin download found | [MySQL Logo Usage Guidelines](https://www.mysql.com/about/legal/trademark.html), [Oracle logo guidelines](https://www.oracle.com/legal/logos/) |
| Snowflake | **NOT CLEARLY ALLOWED**: use the monogram | No grant to third parties anywhere: "all usage rights are reserved". The brand kit's rules cover clear space and require ® with the snowflake "bug" mark. | [Snowflake-Logo-Package.zip](https://www.snowflake.com/wp-content/uploads/2021/04/Snowflake-Logo-Package.zip) on the brand page; no licence stated | [Snowflake Site Terms](https://snowflake.com/en/legal/snowflake-site-terms/), [Brand Guidelines](https://www.snowflake.com/brand-guidelines/) |
| Google BigQuery | **NOT CLEARLY ALLOWED**: approval is required, so use the monogram | Google product icons need permission through the Partner Marketing Hub approval form. Your own brand must be more prominent than the icon. | [cloud.google.com/icons](https://cloud.google.com/icons) (core-products zip): "for your diagrams, technical documentation, and more"; no licence grant | [Google: how to show Google's brand](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/) |
| Microsoft SQL Server | **NOT ALLOWED** without a licence: use the monogram | Logos and product icons "can never be used without an express license". The Azure icons are for diagrams, training materials and documentation only. | [Azure icon set V24](https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip): diagrams, training and documentation only | [Microsoft Trademark and Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks), [Azure icon terms](https://learn.microsoft.com/en-us/azure/architecture/icons/) |
| Oracle Database | **NOT ALLOWED** without Oracle's written authorization: use the monogram | Written authorization is needed. Licensed users must not alter the logo and must use Oracle-approved artwork. | None public; artwork is supplied on approval (UNVERIFIED, see the last section) | [Oracle logo guidelines](https://www.oracle.com/legal/logos/), [Oracle trademark guidelines](https://www.oracle.com/legal/trademarks/) |
| Dremio | **NOT CLEARLY ALLOWED**: use the monogram | No published licence for the logo. The page asks you to contact Dremio about using its marks. The Narwhal logo is a registered mark. | None found | [Dremio Trademarks](https://www.dremio.com/legal/trademarks/) |

## Install

There is nothing to install. Monograms need no third-party asset.

Don't add npm icon packs (simple-icons, devicon and similar) to get these logos. A pack's own licence covers the pack, not the vendors' trademarks. Simple Icons, for one, says its CC0 licence "doesn't mean to imply that all icons within the project are also CC0". It asks users to check each brand's guidelines ([simple-icons DISCLAIMER.md](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)).

## Init / auth pattern

How AC-338 applies, as of 2026-09-27:
- Each `DriverType` shows its monogram. No driver has a cleared logo.
- To show a vendor's logo later, the vendor's written permission (or a changed published licence) must be recorded in a sibling doc in `docs/research/`. That doc must name the permitted asset and its conditions. `driverMarks.tsx` switches only that driver.
- The T472 test (`driverMarks.test.tsx`) can assert two things: all eight drivers render a monogram, and none renders an `<img>` or `<svg>` vendor logo.

## API surface we will use

Here the "surface" is each vendor's published terms. Quotes are kept under 15 words, and each links to its source.

### PostgreSQL (PostgreSQL Community Association of Canada; the "Slonik" elephant)

**1. May a third-party UI show the logo to identify the database? Not clearly.**
- The policy covers the words and the logo: "Postgres and PostgreSQL and the Elephant Logo (Slonik)" are the Association's registered marks ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- The fair uses that need no approval are about the words. The policy says "You may make fair use of Postgres or PostgreSQL to refer to the software". It sums them up as "these kinds of uses of the words Postgres and PostgreSQL are generally fine" ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- The list mentions "in your software or documentation" for true statements such as runs on or with PostgreSQL, but again only for the names ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- The fair-use list doesn't mention the logo, and the other approved uses are for events, user groups and nonprofits ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- Anything else needs approval: "For pretty much any use not discussed above, you must contact us for permission" ([policy](https://www.postgresql.org/about/policies/trademarks/)).

**2. Conditions, if permitted:**
- Presentation: "They should not be presented with other trademarks or logos." A picker grid of eight vendors would break this rule ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- Form: "The Elephant Logo (Slonik) must appear in one of the forms below". The two forms are colour and black-and-white ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- No changes to the marks "without prior approval" ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- Marking: ® is encouraged, or ™ for the outline Slonik ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- Attribution: a line is requested "wherever possible". It names the marks as the Association's and ends "and used with their permission". That wording is only accurate once permission exists ([policy](https://www.postgresql.org/about/policies/trademarks/)).

**3. Asset:** The files are on [wiki.postgresql.org/wiki/Logo](https://wiki.postgresql.org/wiki/Logo): the 3-colour SVG/PNG and black, blue and white variants. The page says "Use of the logo is subject to our Trademark Policy." ([wiki](https://wiki.postgresql.org/wiki/Logo))
- Approval requests go to board@lists.postgres.ca ([policy](https://www.postgresql.org/about/policies/trademarks/)).
- The policy page's last update, as the fetcher reported it, was 2024-11-20.

**4. Verdict: NOT CLEARLY ALLOWED.** Use the monogram.

### Amazon Redshift (AWS)

**1. May a third-party UI show the logo? No, not without written permission.**
- The Fair Use section says: "Any such use should be in plain text only (no logos)". It also says "Fair use does not permit you to state or imply affiliation, sponsorship, or endorsement" ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)).
- The licences AWS grants in these guidelines are for the Powered by AWS logo ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)). That logo would say wechart runs on AWS, which is not what a driver tile means.
- Other uses fall outside those licences, and a use "outside the scope of the foregoing licenses requires Licensor's prior written permission" ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)).
- "AWS Marks" includes AWS product and service names and logos ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)).

**2. Conditions, if licensed:**
- "You will not alter the logo images in any manner" ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)).
- For the name in plain text, AWS gives the format "[Your Brand or Use Case] [relational phrase] [AWS Mark]", with the example "YourApp for Amazon S3". "Works with" and "compatible with" are among the allowed phrases ([AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)).

**3. Asset:** The [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) package ([zip, 2026-07-31 release](https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip)) is not a licence for use in a product.
- AWS allows customers and partners to "use these toolkits and assets to create architecture diagrams" ([icons page](https://aws.amazon.com/architecture/icons/)).
- It adds: "You can also put icons in materials like whitepapers, presentations, data sheets, and posters." ([icons page](https://aws.amazon.com/architecture/icons/))
- Product UIs are not mentioned.

**4. Verdict: NOT ALLOWED.** Use the monogram.

### MySQL (Oracle; the dolphin)

**1. May a third-party UI show the logo? No.**
- Only "certain MySQL logos may be used without specific written permission from Oracle" ([MySQL Logo Usage Guidelines](https://www.mysql.com/about/legal/trademark.html)).
- Those are the MySQL Conditional Use Logos, which the page shows as "Powered by MySQL" and "Includes MySQL" ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)). Both would make a false claim about wechart, which neither is powered by nor includes MySQL.
- Other MySQL logos (partner, affiliate, certification) may be "used by parties having a written and signed agreement with Oracle" ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).
- For Oracle logos in general, the MySQL page defers to Oracle's third-party logo guidelines ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)). Those require written authorization; see the Oracle section.
- No clause grants use of the plain dolphin or MySQL logo ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).

**2. Conditions on the conditional-use logos, which don't fit here anyway:**
- Each "must be a 'clickable' link that leads directly to https://www.mysql.com/" ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).
- Each "must be placed only in areas that are not password-protected". The wechart wizard sits behind sign-in in phase 2 ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).
- None "may be used on any product packaging or documentation" ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).
- You may only resize them proportionally ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).
- The page warns: "USE OF ANY MYSQL CONDITIONAL USE LOGO IS AT YOUR OWN RISK" ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).

**3. Asset:** No public download of the dolphin logo was found. The conditional-use logos appear on the [MySQL guidelines page](https://www.mysql.com/about/legal/trademark.html). Permission requests go to trademar_us@oracle.com ([MySQL guidelines](https://www.mysql.com/about/legal/trademark.html)).

**4. Verdict: NOT ALLOWED.** Use the monogram.

### Oracle Database (Oracle)

oracle.com returns HTTP 403 to direct fetches. Both Oracle pages were read through the r.jina.ai reader and checked against search-engine extracts of the same URLs.

**1. May a third-party UI show the logo? No, not without written authorization.**
- Third parties are "generally not able to use Oracle logos unless you are specifically licensed" ([Oracle logo guidelines](https://www.oracle.com/legal/logos/)).
- "You must have Oracle's written authorization to use the Oracle logo or O Tag." ([Oracle logo guidelines](https://www.oracle.com/legal/logos/))
- Some logos can be licensed through Oracle logo programs, to "Qualified third parties" ([Oracle logo guidelines](https://www.oracle.com/legal/logos/)).

**2. Conditions, if authorized:**
- Licensees "must not alter or modify them in any way" and must use Oracle-approved artwork ([Oracle logo guidelines](https://www.oracle.com/legal/logos/)).
- Name use is allowed: "You may generally use Oracle trademarks to refer to the associated Oracle products" ([Oracle trademark guidelines](https://www.oracle.com/legal/trademarks/)).
- Tag lines are allowed, "such as 'for Oracle database'" ([Oracle trademark guidelines](https://www.oracle.com/legal/trademarks/)).
- Oracle asks for attribution, for example "Oracle, Java, MySQL, and NetSuite are registered trademarks of Oracle and/or its affiliates." ([Oracle trademark guidelines](https://www.oracle.com/legal/trademarks/))

**3. Asset:** No public asset. A request goes to trademar_us@oracle.com with a description of the use and a mock-up ([Oracle logo guidelines](https://www.oracle.com/legal/logos/)).

**4. Verdict: NOT ALLOWED.** Use the monogram.

### Snowflake

**1. May a third-party UI show the logo? Not clearly: no published grant.**
- The Site Terms call "Snowflake" and the Snowflake logos marks "for which all usage rights are reserved" ([Snowflake Site Terms](https://snowflake.com/en/legal/snowflake-site-terms/), last updated 2025-04-14).
- The Brand Guidelines page gives "downloadable resources to help execute on a range of Snowflake projects" ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).
- It has a "For Partners" lockup section ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).
- It has no sentence that grants third parties permission to use the marks ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).

**2. Conditions in the brand kit, for anyone permitted:**
- Clear space: "minimum clear space on all sides that is equal to the x-height" ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).
- A minimum size is set ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)); the value was not captured.
- "The Snowflake bug must always be used with the registration mark." ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/))
- Use the blue logo on white and the white logo on Snowflake Blue ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).

**3. Asset:** [Snowflake-Logo-Package.zip](https://www.snowflake.com/wp-content/uploads/2021/04/Snowflake-Logo-Package.zip) and [Snowflake-Partner-Guidelines.zip](https://www.snowflake.com/wp-content/themes/snowflake/assets/img/brand-guidelines/downloads/Snowflake-Partner-Guidelines.zip), both linked from the [Brand Guidelines](https://www.snowflake.com/brand-guidelines/). No licence is stated.

**4. Verdict: NOT CLEARLY ALLOWED.** Use the monogram.

### Google BigQuery (Google Cloud)

**1. May a third-party UI show the logo? Not without Google's approval.**
- Product icons need approval. "To use a Google product icon in your work", you create a Partner Marketing Hub account and "request permission through our approval form" ([how to show Google's brand](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/); about.google's brand-elements page redirects there).
- For the Google logo, "We don't allow our logo to be used by individuals or companies" that are not formal partners ([partnerships guidance](https://about.google/brand-resource-center/guidance/partnerships/)).
- Plain-text name use is allowed: you can "refer to Google or our products in an informational context in plain text" ([guidance](https://about.google/brand-resource-center/guidance/)).

**2. Conditions, if approved:**
- "Make sure your brand is more prominent than Google's product icon." ([how to show Google's brand](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/))
- Don't use an icon "out of context" without explaining what it means ([same page](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/)).
- "Use only Google-approved artwork when using Google's logos." ([Google trademark guidelines](https://partnermarketinghub.withgoogle.com/brands/google/trademarks-and-terms/trademark-guidelines-for-proper-usage/))

**3. Asset:** The [Google Cloud icon library](https://cloud.google.com/icons) offers "the Google Cloud product icons you need for your diagrams, technical documentation, and more". The page was read through r.jina.ai because direct fetches came back truncated.
- Files: [core-products-icons.zip](https://services.google.com/fh/files/misc/core-products-icons.zip) and an [overview deck](https://services.google.com/fh/files/misc/google-cloud-product-icons.pdf), updated May 2026. The deck lists BigQuery as a core product icon.
- Neither the page nor the deck states a licence or grant.
- The deck says the legacy console icons "should not be used as of 2026" ([deck](https://services.google.com/fh/files/misc/google-cloud-product-icons.pdf)).

**4. Verdict: NOT CLEARLY ALLOWED** (approval required). Use the monogram.

### Microsoft SQL Server

**1. May a third-party UI show the logo? No, not without a licence.**
- Microsoft's "logos, app and product icons" and designs "can never be used without an express license" ([Microsoft Trademark and Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
- Its icons "can never be used as your app icon" ([same page](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
- Plain-text compatibility statements are allowed, for example "Contoso software works with Microsoft OneDrive" ([same page](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
- The corporate logo guidance says: "Do not use the Microsoft corporate logo in products" without a formal licence ([Microsoft logo third-party guidance, Aug 2025](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/mscle/documents/legal/intellectualproperty/trademarks/Microsoft_logo_third_party_usage_guidance_.pdf)).

**2. Conditions:**
- The Azure icon terms: "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation." ([Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/))
- Use is "only for the permitted use unless granted explicit permission by Microsoft" ([Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)).
- "Don't use Microsoft product icons to represent your product or service." ([Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/))
- A trademark footnote is requested, ending "are trademarks of the Microsoft group of companies" ([Microsoft guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).

**3. Asset:** [Azure_Public_Service_Icons_V24.zip](https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip), from the [Azure icons page](https://learn.microsoft.com/en-us/azure/architecture/icons/), updated July 2026. It is licensed for diagrams, training and documentation only. No public SQL Server logo kit was found.

**4. Verdict: NOT ALLOWED.** Use the monogram.

### Dremio

**1. May a third-party UI show the logo? Not clearly: no published licence.**
- The trademarks page lists the "Narwhal logo" as a registered mark ([Dremio Trademarks](https://www.dremio.com/legal/trademarks/)).
- It gives no terms for third-party use of the logo. It says: "For more information on how to use Dremio trademarks contact us" ([Dremio Trademarks](https://www.dremio.com/legal/trademarks/)).
- A mark missing from the list "does not constitute a waiver of Dremio's trademark or other intellectual property rights" ([Dremio Trademarks](https://www.dremio.com/legal/trademarks/)).
- Dremio OSS is Apache-2.0 ([dremio-oss](https://github.com/dremio/dremio-oss)). Apache 2.0 §6 "does not grant permission to use the trade names, trademarks, service marks" ([Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)).

**2. Conditions:** Only the attribution notice is published: "Dremio and Subsurface are trademarks of Dremio Corporation" and so on ([Dremio Trademarks](https://www.dremio.com/legal/trademarks/)).

**3. Asset:** None found. `/press-kit/` returns 404. `/newsroom/` and `/legal/` link to no brand kit ([Dremio legal index](https://www.dremio.com/legal/)).

**4. Verdict: NOT CLEARLY ALLOWED.** Use the monogram.

## Gotchas

- **Names in plain text are fine; logos are not.** Every vendor allows accurate plain-text references to its product:
  - PostgreSQL ([policy](https://www.postgresql.org/about/policies/trademarks/)).
  - AWS: "YourApp for Amazon S3" ([AWS](https://aws.amazon.com/trademark-guidelines/)).
  - Oracle: "for Oracle database" ([Oracle](https://www.oracle.com/legal/trademarks/)).
  - Microsoft: "works with" ([Microsoft](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
  - Google: plain text ([Google](https://about.google/brand-resource-center/guidance/)).

  Spell each name exactly as the vendor does. Google, for example, asks you to "Spell and capitalize the trademark exactly as shown" ([Google trademark guidelines](https://partnermarketinghub.withgoogle.com/brands/google/trademarks-and-terms/trademark-guidelines-for-proper-usage/)).
- **Monograms must not imitate trade dress.**
  - Google: "Don't imitate Google's logo or visual identity (distinctive color combinations" ([Google guidance](https://about.google/brand-resource-center/guidance/)).
  - AWS's guidelines have a Trade Dress section against imitating AWS's look and feel ([AWS](https://aws.amazon.com/trademark-guidelines/)). The fetcher would only summarise that section, so its exact wording isn't quoted here.
  - So draw monograms in wechart's own neutral palette, not vendor colours (no PostgreSQL blue, Snowflake blue or Google four-colour). Don't draw an elephant, dolphin, narwhal or snowflake shape either.
- **Nobody offers a nominative-use exception for logos.** AWS says fair use is "plain text only (no logos)" ([AWS](https://aws.amazon.com/trademark-guidelines/)). The others require a licence, permission or approval, or say nothing.
- **Diagram icon sets are not product licences.** The AWS, Azure and Google Cloud icon kits are published for diagrams, documentation, training or presentations ([AWS](https://aws.amazon.com/architecture/icons/), [Azure](https://learn.microsoft.com/en-us/azure/architecture/icons/), [Google Cloud](https://cloud.google.com/icons)). Microsoft adds "Don't use Microsoft product icons to represent your product or service." ([Azure](https://learn.microsoft.com/en-us/azure/architecture/icons/))
- **Terms and assets change.**
  - The AWS icon packages are released every quarter ([AWS](https://aws.amazon.com/architecture/icons/)). The Azure icons were last updated in July 2026 ([Azure](https://learn.microsoft.com/en-us/azure/architecture/icons/)).
  - Google replaced its Cloud icons in 2025, and the legacy icons "should not be used as of 2026" ([deck](https://services.google.com/fh/files/misc/google-cloud-product-icons.pdf)).
  - Simple Icons asks users to "regularly check" brand guidelines for changes ([simple-icons](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)).
  - Re-check before relying on any permission.
- **Attribution line.** Several vendors request or encourage a trademark notice:
  - Microsoft ([footnote](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks)).
  - Oracle ([attribution](https://www.oracle.com/legal/trademarks/)).
  - PostgreSQL ([line](https://www.postgresql.org/about/policies/trademarks/)).
  - Dremio ([notice](https://www.dremio.com/legal/trademarks/)).

  If wechart names these products, a notice in an About or legal screen that lists the third-party marks as their owners' trademarks would meet those requests. This is a suggestion; no AC requires it. Don't copy PostgreSQL's "used with their permission" wording unless permission has actually been granted.
- **Small sizes and dark mode.** These only matter if a logo is ever licensed.
  - The Microsoft corporate logo's digital minimum is 72 px wide, so it can't fit a 28 px tile ([guidance PDF](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/mscle/documents/legal/intellectualproperty/trademarks/Microsoft_logo_third_party_usage_guidance_.pdf)).
  - Snowflake sets a minimum size and a clear-space rule ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)).
  - Dark-mode variants must be the vendor's own: Snowflake's white logo ([Brand Guidelines](https://www.snowflake.com/brand-guidelines/)), PostgreSQL's approved colour or black-and-white forms ([policy](https://www.postgresql.org/about/policies/trademarks/)), or the white variant on its wiki ([wiki](https://wiki.postgresql.org/wiki/Logo)). Don't recolour a logo.
- **Password-protected placement.** MySQL's conditional-use logos are barred from password-protected areas ([MySQL](https://www.mysql.com/about/legal/trademark.html)). The wechart wizard sits behind sign-in, so these logos are out even as a workaround.
- **Other products' practice is not a licence.** Superset and Metabase show database marks (UX-203 in `docs/design/reviews/2026-09-27/ui-review.md`). Whether they hold permission was not researched, and it grants wechart nothing.
- **Shipping is distribution.** A self-hosted wechart would ship any logo file inside its bundle, which is redistributing the asset, not only displaying it. Any permission requested should cover redistribution in self-hosted builds.

## Alternatives considered

Not requested. The AC's own fallback, a monogram of the name, is the result for all eight drivers.

## Open questions / unverified

- UNVERIFIED: the exact wording of Oracle's two pages. oracle.com returns HTTP 403 to direct fetches, including /legal/logos/, /legal/trademarks/, regional mirrors and the legacy /html/3partylogo.html. They were read through the r.jina.ai reader and cross-checked against search-engine extracts.
- UNVERIFIED: that Oracle sends "electronic artwork" once approval is granted. This comes only from a search-engine extract of https://www.oracle.com/legal/logos/.
- UNVERIFIED: whether the AWS icon package contains an Amazon Redshift icon, and whether the Azure V24 set contains a SQL Server icon. The zips weren't opened. The verdicts don't depend on this.
- UNVERIFIED: whether Microsoft publishes a SQL Server logo kit, and whether Google Cloud publishes partner brand terms outside the Partner Marketing Hub login. Neither was found, and the web-search budget ran out before further searching.
- UNVERIFIED: what the Snowflake Partner Guidelines zip and the "Powered by Snowflake" partner programme contain. Neither was read; both appear to require a partner relationship.
- UNVERIFIED: Snowflake's minimum logo size in pixels (not captured).
- UNVERIFIED: whether any public download of the MySQL dolphin exists. None was found on mysql.com's guidelines page.
- UNVERIFIED: whether Dremio has a brand or press kit anywhere. /press-kit/ (404), /newsroom/ and /legal/ were tried.
- UNVERIFIED: the Microsoft trademark page's quotes. They come from the fetcher's extraction, consistent across two fetches, and the page shows no date. The Azure icon terms and the corporate-logo PDF were read verbatim.
- UNVERIFIED: the PostgreSQL policy's last-updated date (2024-11-20), as reported by the fetcher.
- UNVERIFIED: the exact wording of AWS's Trade Dress section. The fetcher would only summarise it.
- Out of scope, not researched: whether nominative fair use in trademark law, in any jurisdiction, would allow a logo where the vendor's terms don't. AC-338 turns on "the vendor's licence terms", so this doc judges by published terms only.
- Open question for the user: should wechart ask any vendor for written permission? The addresses are board@lists.postgres.ca, trademar_us@oracle.com (Oracle and MySQL), the Google Partner Marketing Hub approval form, and the Dremio trademarks contact. A grant would go in a sibling doc in `docs/research/`, and only that driver's tile would change.
