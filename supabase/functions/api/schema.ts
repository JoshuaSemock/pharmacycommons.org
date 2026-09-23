// Published contracts for the Pharmacy Commons entity document.
// Served at /v1/schema/entity.json and /v1/context.jsonld.
// Bump api_meta.schema_version when ENTITY_SCHEMA changes shape.

export const SITE = "https://pharmacycommons.org";

const ref = {
  type: "object",
  description: "Compact reference to another PCID record.",
  required: ["@id", "pcid", "name", "slug", "entity_type"],
  properties: {
    "@id": { type: "string", format: "uri", description: "Permanent IRI: https://pharmacycommons.org/id/PCID-n" },
    pcid: { $ref: "#/$defs/pcid" },
    name: { type: "string" },
    slug: { type: "string" },
    entity_type: { $ref: "#/$defs/entity_type" },
  },
};

export function entitySchema(apiBase: string) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${apiBase}/v1/schema/entity.json`,
    title: "Pharmacy Commons entity document",
    description:
      "One PCID record as served by /v1/entities/{PCID}. Every record, in every block, has this shape; sections with no data are omitted rather than sent empty.",
    type: "object",
    required: ["@context", "@id", "pcid", "pcid_int", "entity_type", "block", "name", "slug", "slug_uri", "version", "links"],
    $defs: {
      pcid: { type: "string", pattern: "^PCID-[1-9][0-9]{6}$" },
      entity_type: {
        type: "string",
        enum: ["moiety", "combination", "precise_form", "formulation", "class", "clinical", "measurement", "target", "functional"],
      },
      ref,
      source: {
        type: "object",
        required: ["key", "name", "kind", "contributes"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          publisher: { type: "string" },
          url: { type: "string", format: "uri" },
          license: { type: "string", description: "Only present when known; otherwise see terms_url." },
          terms_url: { type: "string", format: "uri" },
          kind: { enum: ["external", "curated", "derived", "machine_assisted"] },
          contributes: {
            type: "array",
            items: { enum: ["identity", "identifiers", "classification", "brands", "relationships", "labels", "guidelines", "structure"] },
          },
        },
      },
    },
    properties: {
      "@context": { type: "string", format: "uri" },
      "@id": { type: "string", format: "uri" },
      "@type": { type: "array", items: { type: "string" } },
      pcid: { $ref: "#/$defs/pcid" },
      pcid_int: { type: "integer", minimum: 1000001, maximum: 9999999 },
      entity_type: { $ref: "#/$defs/entity_type" },
      block: {
        type: "object",
        properties: { id: { type: "integer", minimum: 1, maximum: 9 }, label: { type: "string" } },
      },
      name: { type: "string" },
      slug: { type: "string" },
      slug_uri: { type: "string", pattern: "^pc:[a-z_]+:" },
      identifiers: {
        type: "object",
        description: "Foreign-sourced identifiers. Never keys — PCID is the only native key.",
        properties: {
          cas: { type: "string" },
          unii: { type: "string" },
          inchi_key: { type: "string" },
          drugbank_id: { type: "string" },
          lactmed_id: { type: "string" },
          rxcui: { type: "string" },
          ndc_codes: { type: "array", items: { type: "string" } },
          fda_application_numbers: { type: "array", items: { type: "string" } },
          class_code: { type: "string", description: "Source-system code for a class record (ATC code, EPC N-code, ChemOnt ID, VA class)." },
        },
      },
      attributes: {
        type: "object",
        description: "Remaining populated columns of the record's block table (legal status, term type, schedule, etc.). Keys vary by block.",
        additionalProperties: true,
      },
      classification: {
        type: "object",
        properties: {
          primary: { $ref: "#/$defs/ref" },
          parent: { $ref: "#/$defs/ref" },
          members: { type: "object", properties: { count: { type: "integer" }, direct: { type: "integer" } } },
          memberships: {
            type: "array",
            items: {
              type: "object",
              required: ["class", "direct"],
              properties: {
                class: { $ref: "#/$defs/ref" },
                class_type: { type: "string" },
                code: { type: "string" },
                system: { type: "string" },
                direct: { type: "boolean", description: "false = inherited from an ancestor class" },
                basis: { type: "string", description: "How the membership was established (rxcui, hierarchy, chemont_link, rule, …)" },
                machine_assisted: { const: true, description: "Present only when a rule or AI-assisted review made the assignment" },
              },
            },
          },
        },
      },
      hierarchy: {
        type: "object",
        properties: {
          synonym_of: { $ref: "#/$defs/ref" },
          synonyms: { type: "array", items: { $ref: "#/$defs/ref" } },
          parent_moieties: {
            type: "array",
            items: { allOf: [{ $ref: "#/$defs/ref" }, { properties: { relation: { type: "string" } } }] },
          },
          precise_forms: { type: "array", items: { $ref: "#/$defs/ref" } },
          combinations: { type: "array", items: { $ref: "#/$defs/ref" } },
          formulations: { type: "array", items: { $ref: "#/$defs/ref" } },
        },
      },
      relationships: {
        type: "array",
        description: "Every clinical_statements triple this PCID takes part in, as subject, object or comparator.",
        items: {
          type: "object",
          required: ["statement_id", "predicate", "role", "subject"],
          properties: {
            statement_id: { type: "integer" },
            predicate: { type: "string", description: "Controlled vocabulary — see the predicates table / Legend_Key." },
            role: { enum: ["subject", "object", "comparator"] },
            subject: { $ref: "#/$defs/ref" },
            object: { $ref: "#/$defs/ref" },
            object_label: { type: "string" },
            comparator: { $ref: "#/$defs/ref" },
            qualifier: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } } },
            risk_profile: { type: "string" },
            evidence: {
              type: "object",
              properties: {
                level: { type: "string" },
                source_agency: { type: "string" },
                source_doc_id: { type: "string" },
                section: { type: "string" },
                quote: { type: "string" },
              },
            },
            updated_at: { type: "string", format: "date-time" },
          },
        },
      },
      brands: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            marketed: { type: "boolean" },
            rxcui: { type: "string" },
            fda_application_numbers: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      labels: {
        type: "object",
        description: "DailyMed SPL labels for this record: total count and the top five by rank.",
        properties: {
          count: { type: "integer" },
          top: {
            type: "array",
            items: {
              type: "object",
              properties: {
                setid: { type: "string" },
                title: { type: "string" },
                labeler: { type: "string" },
                document_type: { type: "string" },
                effective_date: { type: "string", format: "date" },
                plr_format: { type: "boolean" },
                url: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
      fda_applications: { type: "array", items: { type: "object" } },
      structure: {
        type: "object",
        properties: {
          cas_rn: { type: "string" },
          smiles: { type: "string" },
          inchi: { type: "string" },
          inchi_key: { type: "string" },
          molecular_formula: { type: "string" },
          molecular_weight: { type: "number" },
          log_kow: { type: "number" },
          pka: { type: "number" },
          water_solubility_mg_l: { type: "number" },
        },
      },
      guidelines: { type: "array", items: { type: "object" } },
      provenance: {
        type: "object",
        properties: {
          primary_source: { type: "string" },
          source_count: { type: "integer" },
          origin: { type: "string" },
          record_created: { type: "string", format: "date-time" },
          record_updated: { type: "string", format: "date-time" },
          sources: { type: "array", items: { $ref: "#/$defs/source" } },
        },
      },
      version: {
        type: "object",
        required: ["number", "latest", "is_latest", "hash", "reason", "created_at"],
        properties: {
          number: { type: "integer", minimum: 1 },
          latest: { type: "integer", minimum: 1 },
          is_latest: { type: "boolean" },
          hash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$", description: "SHA-256 of the content body (everything except @context/@id/@type, version, links, license, api_version, schema_version, generated_at)." },
          reason: { enum: ["baseline", "change", "derived"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      links: {
        type: "object",
        properties: {
          self: { type: "string", format: "uri" },
          canonical: { type: "string", format: "uri" },
          html: { type: "string", format: "uri" },
          json: { type: "string", format: "uri" },
          versions: { type: "string", format: "uri" },
          changes: { type: "string", format: "uri" },
          schema: { type: "string", format: "uri" },
          context: { type: "string", format: "uri" },
        },
      },
      license: {
        type: "object",
        properties: { data: { type: ["string", "null"] }, url: { type: ["string", "null"] }, note: { type: "string" } },
      },
      api_version: { type: "string" },
      schema_version: { type: "string" },
      generated_at: { type: "string", format: "date-time" },
    },
  };
}

const iri = { "@type": "@id" };
const when = { "@type": "xsd:dateTime" };

export const CONTEXT = {
  "@context": {
    "@version": 1.1,
    "@vocab": `${SITE}/vocab#`,
    pc: `${SITE}/vocab#`,
    schema: "https://schema.org/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    name: "schema:name",
    brands: { "@id": "pc:brand", "@container": "@set" },
    relationships: { "@id": "pc:statement", "@container": "@set" },
    memberships: { "@id": "pc:classMembership", "@container": "@set" },
    guidelines: { "@id": "pc:guideline", "@container": "@set" },
    ndc_codes: { "@id": "pc:ndcCode", "@container": "@set" },
    fda_application_numbers: { "@id": "pc:fdaApplicationNumber", "@container": "@set" },
    unii: "pc:unii",
    cas: "pc:casRegistryNumber",
    inchi_key: "pc:inchiKey",
    drugbank_id: "pc:drugbankId",
    rxcui: "pc:rxcui",
    url: { "@id": "schema:url", "@type": "@id" },
    terms_url: iri,
    // Link terms are scoped so "schema"/"context" here don't shadow the prefixes above.
    links: {
      "@id": "pc:links",
      "@context": {
        self: iri,
        canonical: iri,
        html: iri,
        json: iri,
        versions: iri,
        changes: iri,
        schema: { "@id": "pc:schemaDocument", "@type": "@id" },
        context: { "@id": "pc:contextDocument", "@type": "@id" },
      },
    },
    record_created: when,
    record_updated: when,
    created_at: when,
    updated_at: when,
    generated_at: when,
  },
};
