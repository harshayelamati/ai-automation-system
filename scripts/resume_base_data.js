/**
 * resume_base_data.js
 * Harsha's base resume as structured data — used by build_resume_dynamic.js
 */

module.exports = {
  name: "HARSHA YELAMATI",
  contact: {
    location: "Sunnyvale, CA",
    phone: "+1 408-420-7642",
    email: "yelamatiharsha1@gmail.com",
    linkedin: "linkedin.com/in/harshayelamati",
    linkedinUrl: "https://linkedin.com/in/harshayelamati",
    github: "github.com/harshayelamati",
    githubUrl: "https://github.com/harshayelamati",
  },

  // Default summary — overridden per job by dynamic builder
  defaultSummary:
    "SAP ABAP developer with 5+ years of hands-on experience delivering RICEF solutions, OData services, and S/4HANA integrations for enterprise clients across SD, MM, and BW landscapes. Known for translating complex functional specs into clean, performant ABAP — and for going beyond the ticket to understand why a system works the way it does. Recently built a full production AI system from the ground up (n8n + Claude API + Oracle Cloud, running 24/7), which gave hands-on experience with REST APIs, cloud infrastructure, and event-driven design patterns. That's not a side project — it's the same integration thinking that BTP and modern SAP cloud roles demand. Master's in Data Analytics, Indiana Wesleyan University (2025). Based in Sunnyvale, CA. Seeking H1B sponsorship.",

  skills: {
    "SAP Core":         "ABAP, RICEF, Smart Forms, Adobe Forms, ALV Reports, OData Services, BAPI, IDoc, BDC, S/4HANA, SAP HANA Studio, STMS, Data Dictionary",
    "Performance Tools":"ST05, ST12, SAT, ST04, SM37, SM50/SM66, DB02, ST03N",
    "AI & Automation":  "Claude API, n8n (workflow orchestration), Telegram Bot API, REST APIs",
    "Cloud & Infra":    "Oracle Cloud (self-hosted VPS), GitHub Pages, GoDaddy domain management",
    "Data & Analytics": "SQL, BW Transformations, Open Hub Destinations, HANA Calculation Views",
    "Programming":      "SAP ABAP, SQL; AI-assisted development (Claude, ChatGPT)",
  },

  experience: [
    {
      title:   "Senior Consultant – SAP Package Implementation",
      company: "LTI Mindtree  (Clients: Infinium Technologies, Johnson Controls)",
      dates:   "May 2022 – Jul 2023",
      bullets: [
        "Designed and enhanced Smart Forms and Adobe Forms supporting logistics and manufacturing processes, reducing manual document errors by 30%.",
        "Developed ALV reports for vendor and operational data, improving reporting turnaround time by 40%.",
        "Migrated and validated 100+ ABAP objects across DEV, QA, and PROD systems during S/4HANA landscape alignment.",
        "Supported OData service migration from legacy ECC to HANA, ensuring seamless connectivity and zero production downtime.",
        "Activated HANA calculation views, BW transformations, and Open Hub destinations for analytics readiness.",
        "Executed cell-level data reconciliation between ECC and HANA systems, achieving 99.9% data accuracy post-migration.",
        "Performed ABAP performance tuning using ST05, ST12, SAT, and ST03N, reducing critical report runtimes by 25–35%.",
        "Tracked expensive SQL statements using DB02 and ST04 to reduce database load; optimized background jobs via SM37 and SM50/SM66.",
        "Supported integration testing for OData, ARIBA, Mellisa, and Entitlement interfaces; raised OSS tickets for complex HANA issues.",
      ],
    },
    {
      title:   "SAP ABAP Consultant / Quality Engineer",
      company: "Doowon Climate Control India Pvt. Ltd.",
      dates:   "May 2019 – Jan 2022",
      bullets: [
        "Built custom ALV reports and Smart Forms from functional specs, giving operations teams real-time visibility into production and inventory data.",
        "Developed reusable ABAP function modules, tables, and custom views — reducing redundant code by 20% and cutting future dev time on similar requests.",
        "Delivered BAPI enhancements and IDoc-based integrations for external vendor systems with zero downtime during go-live.",
        "Set up automated background job scheduling for reporting and form generation, eliminating 30% of recurring manual work.",
      ],
    },
    {
      title:   "SAP ABAP Consultant",
      company: "Elsoft Technologies Private Ltd.",
      dates:   "Apr 2018 – Apr 2019",
      bullets: [
        "Developed ABAP objects including custom tables, programs, and ALV reports based on functional specifications.",
        "Collaborated with functional teams to resolve issues and ensure alignment with business requirements.",
        "Conducted unit, integration, and release testing across multiple phases of the software development lifecycle.",
      ],
    },
  ],

  projects: [
    {
      title:    "AI Personal Assistant",
      subtitle: "Production System — n8n + Claude API + Oracle Cloud (2024–Present)",
      bullets: [
        "Designed and deployed a 24/7 personal AI assistant on Oracle Cloud, processing natural language requests via a Telegram bot interface.",
        "Built 15+ automated workflows using n8n orchestration and Claude API, integrating live finance (gold, stocks, currency), weather, Google Calendar, and email.",
        "Implemented intelligent email triage: urgent alerts (USCIS, job offers, banking) delivered instantly; promotional emails silently filtered — reducing inbox noise by ~80%.",
        "Built an automated job alert pipeline scanning SAP ABAP, Data Engineer, and AI Engineer roles hourly with built-in H1B sponsorship filtering.",
        "System runs autonomously with zero manual intervention; covers finance, productivity, immigration tracking, news, and on-demand briefings.",
      ],
    },
    {
      title:    "Memoria — iOS & macOS Journaling App",
      subtitle: "AI-Assisted Development  —  App Store Submission in Progress (2024–Present)",
      bullets: [
        "Conceptualized and directed development of a premium personal journaling app for Apple platforms (iOS + macOS, single SwiftUI codebase).",
        "Defined full product specification: mood tracking, AI writing prompts, time capsules, per-entry biometric lock (Face ID), voice journaling, and 50-version edit history.",
        "Designed end-to-end user experience including timeline, mosaic grid, mood visualization, insights dashboard, and premium frosted-glass design system.",
      ],
    },
    {
      title:    "Restaurant Website",
      subtitle: "srikrishnatiffins.com (2023)",
      bullets: [
        "Designed and deployed a responsive restaurant website using AI-assisted development; managed domain configuration (GoDaddy) and hosting (GitHub Pages) with SEO optimization.",
      ],
    },
  ],

  education: [
    {
      degree:  "Master's in Data Analytics",
      school:  "Indiana Wesleyan University, Marion, IN",
      details: "GPA: 3.6/5.0  |  Graduated: August 2025",
    },
    {
      degree:  "Bachelor of Engineering, Automobile Engineering",
      school:  "Saveetha University, Chennai, India",
      details: "GPA: 7.5/10  |  Graduated: May 2019",
    },
  ],
};
