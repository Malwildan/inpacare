# Security policy

InpaCare is an educational application with synthetic demo data. Only the current `main` branch receives fixes; there is no supported production release or guaranteed response time.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Malwildan/inpacare/security/advisories/new). Include the affected code or endpoint, steps to reproduce using synthetic records, expected behavior, and impact. Share the minimum evidence needed to investigate.

Do not disclose vulnerabilities in public issues or pull requests before discussing a fix with the maintainer. Never include session cookies, account tokens, patient information, database credentials, or private documents in a report. Test on your own local instance rather than the shared demo.

Demo usernames and the documented synthetic password are intentional. They are not suitable credentials for a real deployment. Runtime secrets belong in ignored, owner-readable configuration files.
