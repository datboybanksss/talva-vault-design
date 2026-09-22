/**
 * Finalised TalVault Privacy Notice (South Africa).
 * Static copy — this document is not versioned in the database like the
 * Terms & Conditions, because it is informational and not accepted by users.
 */

export type LegalBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export type LegalSection = { number: number; heading: string; blocks: LegalBlock[] };

export const PRIVACY_NOTICE_TITLE = "TalVault Privacy Notice — South Africa";
export const PRIVACY_NOTICE_EFFECTIVE_DATE = "Effective date: 17 September 2026";

export const PRIVACY_NOTICE_SECTIONS: LegalSection[] = [
  {
    number: 1,
    heading: "Introduction and scope",
    blocks: [
      {
        kind: "p",
        text: "TalVault is committed to protecting the privacy, confidentiality and security of personal information. This Privacy Notice explains how TalVault collects, uses, stores, shares and otherwise processes personal information when you use its website, platform, applications, services or communicate with TalVault.",
      },
      {
        kind: "p",
        text: "This notice is intended to provide the information contemplated in section 18 of the Protection of Personal Information Act 4 of 2013 (\u201cPOPIA\u201d). It applies to users of the TalVault platform and website, prospective and registered talent, customers and authorised customer users, website visitors, applicants, suppliers and other persons whose personal information TalVault processes in connection with its services.",
      },
    ],
  },
  {
    number: 2,
    heading: "Who is responsible for your personal information?",
    blocks: [
      {
        kind: "p",
        text: "For personal information processed for TalVault's own purposes, the TalVault legal entity identified above is the \u201cResponsible Party\u201d as defined in POPIA and determines the purpose of and means for processing that information.",
      },
      {
        kind: "p",
        text: "Where TalVault processes personal information solely on the documented instructions of a customer or another responsible party, TalVault may act as an \u201cOperator\u201d under POPIA. In those circumstances, the relevant customer or responsible party remains responsible for its own processing decisions and privacy obligations.",
      },
    ],
  },
  {
    number: 3,
    heading: "Personal information we may collect",
    blocks: [
      {
        kind: "p",
        text: "Depending on how you interact with TalVault and which services you use, TalVault may process the following categories of personal information:",
      },
      {
        kind: "ul",
        items: [
          "Identity and profile information, such as your name, surname, date of birth, identity or passport information where required, profile photograph and other identifiers.",
          "Contact information, including email address, telephone number, physical or postal address and communication preferences.",
          "Professional and talent information, including CV or r\u00e9sum\u00e9 information, employment history, job titles, skills, qualifications, education, professional registrations, experience, portfolio information, references, availability and career preferences.",
          "Account and authentication information, including account identifiers, login information and records associated with account security.",
          "Information you upload, enter or generate through the platform, including documents, profile content, applications, assessments, responses, messages and communications.",
          "Customer, employer or recruiter information, including business contact information, organisation details, roles, permissions and platform activity.",
          "Technical and usage information, such as IP address, browser and device information, log data, approximate location derived from technical information, pages or features used, timestamps and diagnostic/security information.",
          "Any other information you voluntarily provide to TalVault or that TalVault is lawfully permitted or required to collect.",
        ],
      },
      {
        kind: "p",
        text: "TalVault will only process special personal information, criminal-behaviour information, biometric information or children's information where permitted by POPIA and where the processing is genuinely required for the relevant service or lawful purpose.",
      },
    ],
  },
  {
    number: 4,
    heading: "How we collect personal information",
    blocks: [
      {
        kind: "p",
        text: "TalVault may collect personal information directly from you when you create or update an account, complete a profile, upload documents, apply or register for opportunities, communicate with TalVault, respond to assessments or forms, or otherwise use the services.",
      },
      {
        kind: "p",
        text: "Where permitted by law, TalVault may also receive information from customers, employers, recruiters, authorised representatives, service providers, publicly available sources, integrations or other third parties. Where information is not collected directly from you, TalVault will take the steps required by POPIA to ensure that the collection is lawful and appropriately transparent, subject to applicable exceptions.",
      },
    ],
  },
  {
    number: 5,
    heading: "Why we process personal information",
    blocks: [
      {
        kind: "p",
        text: "TalVault processes personal information only where there is a lawful justification under POPIA. Depending on the circumstances, processing may be necessary to perform a contract with you, take steps at your request before entering into a contract, comply with a legal obligation, protect a legitimate interest of you or another person, pursue TalVault's legitimate interests or those of a third party, or because you have consented to the processing.",
      },
      { kind: "p", text: "The purposes may include:" },
      {
        kind: "ul",
        items: [
          "creating, administering and securing accounts and profiles;",
          "providing, operating, maintaining and improving the TalVault platform and related services;",
          "enabling talent discovery, recruitment, matching, applications, communication or other platform functionality selected by users or customers;",
          "allowing authorised customers, employers, recruiters or other platform participants to access information that is appropriate to the service and permissions selected;",
          "communicating with you about your account, enquiries, support requests, opportunities, service changes and administrative matters;",
          "verifying information, preventing fraud, abuse and security incidents, and protecting the platform and its users;",
          "conducting analytics, troubleshooting, product development and service improvement using information appropriate for those purposes;",
          "complying with legal, regulatory, audit, accounting and record-keeping obligations and establishing, exercising or defending legal rights; and",
          "sending direct marketing where permitted by POPIA and applicable consumer-protection requirements.",
        ],
      },
      {
        kind: "p",
        text: "Where providing particular information is mandatory to provide a requested service or meet a legal requirement, TalVault will indicate this where reasonably practicable. If required information is not provided, TalVault may be unable to provide the relevant feature or service.",
      },
    ],
  },
  {
    number: 6,
    heading: "Recruitment, matching and automated processing",
    blocks: [
      {
        kind: "p",
        text: "TalVault may use artificial intelligence, algorithmic and other automated tools to organise, search, filter, compare, rank or match profile, skills, experience, preference or opportunity information. Any personal information processed using these tools remains within TalVault's secure environment and is used only for these platform purposes; it is not used to train third-party artificial intelligence models.",
      },
      {
        kind: "p",
        text: "TalVault will not subject a person to a decision based solely on automated processing that has legal consequences for that person, or affects that person to a substantial degree, except where permitted by section 71 of POPIA and with the safeguards required by law. Where applicable, those safeguards include an opportunity to make representations and sufficient information about the underlying logic to enable the person to do so.",
      },
    ],
  },
  {
    number: 7,
    heading: "Sharing personal information",
    blocks: [
      {
        kind: "p",
        text: "TalVault does not sell personal information. TalVault may disclose or make personal information available only where reasonably necessary and lawful, including to:",
      },
      {
        kind: "ul",
        items: [
          "authorised customers, employers, recruiters or other users where sharing forms part of the service, the relevant permissions or the purpose for which the information was provided;",
          "hosting, cloud, authentication, email, communications, analytics, customer-support, security, storage and other technology or professional service providers acting under appropriate contractual and confidentiality arrangements;",
          "professional advisers, auditors, insurers and other parties where reasonably necessary for legitimate business or legal purposes;",
          "law-enforcement bodies, regulators, courts or other competent authorities where disclosure is required or permitted by law; and",
          "a purchaser, investor, successor or adviser in connection with an actual or proposed corporate transaction, subject to appropriate safeguards.",
        ],
      },
    ],
  },
  {
    number: 8,
    heading: "Cross-border transfers",
    blocks: [
      {
        kind: "p",
        text: "Some service providers or recipients may process or store personal information outside South Africa. TalVault will transfer personal information outside the Republic only in accordance with section 72 of POPIA. This may include transfers where the recipient is subject to a law, binding corporate rules or binding agreement that provides an adequate level of protection; where you consent to the transfer; or where another ground permitted by section 72 applies.",
      },
      {
        kind: "p",
        text: "TalVault will assess relevant cross-border processing arrangements and implement appropriate contractual, organisational and technical safeguards where required.",
      },
    ],
  },
  {
    number: 9,
    heading: "Retention and deletion",
    blocks: [
      {
        kind: "p",
        text: "TalVault will not retain records of personal information for longer than necessary to achieve the purpose for which the information was collected or subsequently processed, unless retention is required or authorised by law, reasonably required for lawful purposes related to TalVault's functions or activities, required by a contract, or you have consented to longer retention where consent is an appropriate basis.",
      },
      {
        kind: "p",
        text: "Retention periods may vary according to the type of record, account status, contractual obligations, dispute or claims periods, security requirements and applicable legal obligations. When personal information is no longer required, TalVault will delete, destroy or de-identify it in accordance with POPIA and its retention practices.",
      },
    ],
  },
  {
    number: 10,
    heading: "Security safeguards and security compromises",
    blocks: [
      {
        kind: "p",
        text: "TalVault will take appropriate, reasonable technical and organisational measures to prevent loss of, damage to, unauthorised destruction of, unlawful access to or unlawful processing of personal information. Measures may include access controls, authentication, encryption where appropriate, logging and monitoring, secure development and configuration practices, backups, staff confidentiality obligations, vendor controls and incident-response procedures, taking account of the nature and sensitivity of the information and the risks involved.",
      },
      {
        kind: "p",
        text: "Where TalVault has reasonable grounds to believe that personal information has been accessed or acquired by an unauthorised person, TalVault will follow the notification and response requirements applicable under POPIA, including notification to the Information Regulator and affected data subjects where required.",
      },
    ],
  },
  {
    number: 11,
    heading: "Your rights",
    blocks: [
      { kind: "p", text: "Subject to POPIA and other applicable law, you may have the right to:" },
      {
        kind: "ul",
        items: [
          "ask TalVault to confirm whether it holds personal information about you and request access to that information;",
          "request correction or deletion of personal information that is inaccurate, irrelevant, excessive, out of date, incomplete, misleading or unlawfully obtained, or request destruction or deletion where TalVault is no longer authorised to retain it;",
          "object, on reasonable grounds where applicable, to processing of your personal information;",
          "withdraw consent at any time where processing is based on consent, without affecting processing already lawfully undertaken before withdrawal;",
          "object to direct marketing and require TalVault to stop sending electronic direct marketing;",
          "make representations regarding qualifying automated decisions as provided by POPIA; and",
          "complain to the Information Regulator if you believe your personal information has been processed in breach of POPIA.",
        ],
      },
      {
        kind: "p",
        text: "Requests should be sent to TalVault's Information Officer using the contact details in section 16. TalVault may need to verify your identity before acting on a request and may refuse or limit a request where POPIA, PAIA or another law permits or requires it.",
      },
    ],
  },
  {
    number: 12,
    heading: "Direct marketing",
    blocks: [
      {
        kind: "p",
        text: "TalVault will send direct marketing by electronic communication only as permitted by section 69 of POPIA. Where consent is required, TalVault will request it in the prescribed manner. Where the law permits marketing to an existing customer without fresh consent, TalVault will limit this to its own similar products or services and provide the required opportunities to object.",
      },
      {
        kind: "p",
        text: "Every qualifying direct-marketing communication will identify the sender and provide a practical way to opt out. You may object to direct marketing at any time without charge.",
      },
    ],
  },
  {
    number: 13,
    heading: "Cookies and website analytics",
    blocks: [
      {
        kind: "p",
        text: "TalVault may use cookies, local storage and similar technologies that are necessary for website or platform functionality, security, authentication, preferences, analytics or performance. Some technical information collected through these technologies may constitute personal information under POPIA.",
      },
      {
        kind: "p",
        text: "TalVault uses the following categories of cookies and similar technologies: (i) strictly necessary cookies required for login, security and core platform functionality; (ii) functional cookies that remember preferences and settings; (iii) performance and analytics cookies that help TalVault understand how the platform is used and improve it; and (iv) where applicable, communications-related cookies used in connection with email or messaging features. Users can control or disable non-essential cookies through their browser or device settings and, where available, through an in-platform cookie preference tool, although disabling necessary cookies may affect platform functionality.",
      },
    ],
  },
  {
    number: 14,
    heading: "Children",
    blocks: [
      {
        kind: "p",
        text: "TalVault's services are not intended for children unless TalVault has expressly designed a service for them and has implemented the requirements of POPIA for processing children's personal information.",
      },
      {
        kind: "p",
        text: "If TalVault becomes aware that it has processed a child's personal information without a lawful basis or required authorisation, it will take appropriate steps in accordance with POPIA, which may include deleting the information.",
      },
    ],
  },
  {
    number: 15,
    heading: "Changes to this Privacy Notice",
    blocks: [
      {
        kind: "p",
        text: "TalVault may update this Privacy Notice from time to time to reflect changes in its services, processing activities, legal requirements or safeguards. The current version will be made available through the TalVault website or platform. Where changes are material, TalVault will take reasonable steps to bring them to the attention of affected users where appropriate.",
      },
    ],
  },
  {
    number: 16,
    heading: "Contact and complaints",
    blocks: [
      {
        kind: "p",
        text: "Questions, requests or objections relating to this Privacy Notice or TalVault's processing of personal information may be directed to:",
      },
      {
        kind: "ul",
        items: [
          "Email: support@talvault.com",
          "TalVault legal entity: TalVault (Pty) Ltd",
          "Physical address: Ground Floor, 35 Ferguson Road, Illovo, Johannesburg, 2196, South Africa.",
        ],
      },
      {
        kind: "p",
        text: "You may also lodge a complaint with the Information Regulator (South Africa). At the date of this notice, the Regulator lists the following contact details: Information Regulator (South Africa), Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg; telephone 010 023 5200; email enquiries@inforegulator.org.za. The Regulator also provides an eServices portal for POPIA complaints and security-compromise notifications.",
      },
    ],
  },
];
