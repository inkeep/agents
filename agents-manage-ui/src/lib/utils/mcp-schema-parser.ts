/**
 * Utility functions for parsing MCP tool input schemas
 */

interface SchemaProperty {
	name: string;
	type: string;
	required: boolean;
	description?: string;
	enum?: string[];
}

interface ParsedSchema {
	properties: SchemaProperty[];
	hasProperties: boolean;
}

/**
 * Parse MCP input schema into a more readable format
 * Handles multiple schema formats:
 * - Zod-based schemas (with def.shape structure)
 * - Standard JSON Schema (with properties object)
 * - Direct property objects
 */
export function parseMCPInputSchema(inputSchema: any): ParsedSchema {
	if (!inputSchema || typeof inputSchema !== "object") {
		return { properties: [], hasProperties: false };
	}

	const properties: SchemaProperty[] = [];

	// Handle Zod-based schema format (like Notion MCP)
	if (inputSchema.def?.shape) {
		const shape = inputSchema.def.shape;
		for (const [propertyName, propertyDef] of Object.entries(shape)) {
			const property = parseZodProperty(propertyName, propertyDef as any);
			if (property) {
				properties.push(property);
			}
		}
	}
	// Handle standard JSON Schema format
	else if (inputSchema.properties) {
		for (const [propertyName, propertyDef] of Object.entries(
			inputSchema.properties,
		)) {
			const property = parseJsonSchemaProperty(
				propertyName,
				propertyDef as any,
				inputSchema.required,
			);
			if (property) {
				properties.push(property);
			}
		}
	}
	// Handle direct properties format
	else {
		for (const [propertyName, propertyDef] of Object.entries(inputSchema)) {
			const property = parseGenericProperty(propertyName, propertyDef as any);
			if (property) {
				properties.push(property);
			}
		}
	}

	return {
		properties: properties.sort((a, b) => {
			// Sort required properties first, then by name
			if (a.required !== b.required) {
				return a.required ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		}),
		hasProperties: properties.length > 0,
	};
}

// Parse Zod-based property definition (e.g., Notion MCP)
function parseZodProperty(
	name: string,
	propertyDef: any,
): SchemaProperty | null {
	if (!propertyDef?.def) {
		return null;
	}

	const def = propertyDef.def;
	let type: string;
	let required = true;

	// Handle optional properties
	if (def.type === "optional") {
		required = false;
		if (def.innerType?.def) {
			type = parseTypeFromDef(def.innerType.def);
		} else {
			type = "any";
		}
	} else {
		type = parseTypeFromDef(def);
	}

	return {
		name,
		type,
		required,
	};
}

// Parse standard JSON Schema property definition
function parseJsonSchemaProperty(
	name: string,
	propertyDef: any,
	requiredFields?: string[],
): SchemaProperty | null {
	if (!propertyDef || typeof propertyDef !== "object") {
		return null;
	}

	const type = propertyDef.type || "any";
	const required = requiredFields ? requiredFields.includes(name) : false;

	return {
		name,
		type: formatJsonSchemaType(type, propertyDef),
		required,
		description: propertyDef.description,
		enum: propertyDef.enum,
	};
}

// Parse generic property definition (fallback)
function parseGenericProperty(
	name: string,
	propertyDef: any,
): SchemaProperty | null {
	if (typeof propertyDef !== "object" || propertyDef === null) {
		return {
			name,
			type: typeof propertyDef,
			required: false,
		};
	}

	// Try to infer type from the property definition
	let type = "object";
	if (propertyDef.type) {
		type = propertyDef.type;
	} else if (Array.isArray(propertyDef)) {
		type = "array";
	}

	return {
		name,
		type,
		required: false,
		description: propertyDef.description,
	};
}

// Format JSON Schema type with additional info
function formatJsonSchemaType(type: string, propertyDef: any): string {
	if (type === "array" && propertyDef.items?.type) {
		return `${propertyDef.items.type}[]`;
	}
	return type;
}

function parseTypeFromDef(def: any): string {
	switch (def.type) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "array":
			if (def.element?.def) {
				const elementType = parseTypeFromDef(def.element.def);
				return `${elementType}[]`;
			}
			return "array";
		case "object":
			return "object";
		case "any":
			return "any";
		case "union":
			// Handle union types if needed
			return "union";
		case "literal":
			return `"${def.value}"`;
		default:
			return def.type || "unknown";
	}
}

/**
 * Get a user-friendly type badge color based on the type
 */
export function getTypeBadgeVariant(
	type: string,
): "default" | "secondary" | "destructive" | "outline" {
	if (type.includes("string")) return "default";
	if (type.includes("number")) return "secondary";
	if (type.includes("boolean")) return "outline";
	if (type.includes("array")) return "secondary";
	if (type.includes("object")) return "destructive";
	return "outline";
}
