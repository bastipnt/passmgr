import z from "zod";

/**
 * Input of a mutation with nothing to send. Clients still send `{}`: a POST without a
 * body is rejected by the HTTP adapter ("Unexpected end of JSON input") before the procedure runs.
 */
export const emptyInputSchema = z.object({}).strict().optional();
