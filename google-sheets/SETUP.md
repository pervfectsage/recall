# Publishing Recall

The card editor is a private Google Sheet, separate from this public website.

Install RecallExport.gs as a bound Apps Script in the editor spreadsheet. Configure a fine-grained token restricted to this repository with Contents read/write using the menu. Never store a token in this repository.

In repository Settings > Pages choose GitHub Actions. The Publish to Recall menu commits data/sheet-export.json; the workflow validates and builds the site before deployment.

The initial card dataset is included. The sheet menu requires one-time installation and authentication.
