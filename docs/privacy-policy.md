# Pharmacy Commons — Privacy Policy

**Effective Date:** September 29, 2026

**Website:** [https://pharmacycommons.org](https://pharmacycommons.org)

**Operator:** Pharmacy of the Commons, LLC

This Privacy Policy explains how Pharmacy of the Commons, LLC collects, uses, stores, and protects your information when you use the Pharmacy Commons website, database, and related APIs (the “Services”). As an open-source project, our core philosophy is transparency. We collect only the data necessary to secure the platform, authenticate clinical contributors, and ensure the reliability of the public knowledge base.

### 1. The Strict Prohibition of Protected Health Information (PHI)

**Pharmacy Commons is an educational reference platform, not a healthcare provider, covered entity, or business associate under the Health Insurance Portability and Accountability Act (HIPAA).**

You must never submit, upload, or transmit Protected Health Information (PHI), confidential medical records, or any personally identifiable patient data to the Services. Any user found submitting patient-identifiable case details in public contributions, annotations, or communications will have their account immediately terminated and the offending data purged.

### 2. Information We Collect

We collect information in two categories: data you actively provide and technical data collected automatically by our infrastructure.

**A. Information You Provide**

* **Account Registration:** If you register to contribute to the database, we collect your email address, a hashed password, and your chosen username or public identifier.
* **Clinical Verification:** If you request write-access to edit clinical monographs, we may collect professional verification data, such as your National Provider Identifier (NPI) or licensure status.
* **Public Contributions:** Any edits, annotations, structured data relationships, or comments you submit to the database are recorded. Because this is a public commons, your contributions are permanently associated with your public username or identifier.
* **Communications:** If you email `contact@pharmacycommons.org` with questions, takedown requests, or feedback, we retain that correspondence.

**B. Information Collected Automatically**

* **Infrastructure Logs:** Our frontend is hosted on GitHub Pages. When you visit the site, GitHub automatically collects standard web server logs, including your IP address, browser type, operating system, and the timestamps of your requests, to maintain security and monitor traffic.
* **Authentication & Session Data:** Our backend database and user authentication are powered by Supabase. Supabase logs authentication attempts and API requests to secure the platform against abuse and unauthorized access.

### 3. Cookies and Local Storage

Pharmacy Commons uses minimal local storage and strictly necessary cookies to provide core functionality. We do not use third-party tracking cookies, marketing pixels, or cross-site advertising trackers.

* **Authentication Tokens:** When you log in, Supabase issues secure session tokens stored in your browser to keep you authenticated.
* **UI Preferences:** We utilize your browser’s local storage to remember your interface preferences, such as your manual override for Light/Dark mode.

### 4. How We Use Your Information

We do not sell, rent, or lease your personal information to third parties. We use your data exclusively to:

* Authenticate your identity and manage your write-access permissions.
* Attribute database edits to the correct contributor to maintain an auditable version history.
* Communicate with you regarding account security, policy updates, or issues with your submissions.
* Monitor platform stability, troubleshoot API errors, and prevent malicious scraping or denial-of-service attacks.

### 5. Third-Party Infrastructure Providers

To operate the platform, your data is processed by our trusted infrastructure partners, who are bound by their own rigorous security and privacy standards:

* **GitHub (Microsoft):** Hosts the frontend static assets and routes public web traffic.
* **Supabase:** Hosts the PostgreSQL database, executes Edge Functions, and manages user authentication and encrypted password storage.
* **Porkbun / Cloudflare:** Manages domain registration and DNS routing.

### 6. Data Retention and Account Deletion

You may request to delete your account at any time by emailing `contact@pharmacycommons.org`. Upon receiving a verifiable request, we will delete your email address and authentication credentials from our Supabase backend.

**Note on Public Contributions:** Because Pharmacy Commons operates as a public trust, historical edits and structured data you submitted prior to account deletion become part of the permanent database. When you delete your account, your past contributions will not be removed, but they will be anonymized and disassociated from your personal identity to preserve the integrity and auditability of the clinical record.

### 7. Security

We implement industry-standard security measures, including HTTPS/TLS encryption for all data in transit, Row Level Security (RLS) on our PostgreSQL database to isolate user permissions, and secure credential hashing via Supabase. However, no internet-connected database is completely impenetrable. You are responsible for maintaining the security of your password and account credentials.

### 8. Changes to This Policy

We may update this Privacy Policy as we add new features, such as moderation UI tools or expanded API access. When material changes are made, we will update the "Effective Date" at the top of this document. Continued use of the Services after an update constitutes acceptance of the revised practices.

### 9. Contact

If you have questions about this Privacy Policy, your data rights, or account deletion, please contact the maintainers at:
**Email:** contact@pharmacycommons.org

**Website:** [https://pharmacycommons.org](https://pharmacycommons.org)

**Operator:** Pharmacy of the Commons, LLC