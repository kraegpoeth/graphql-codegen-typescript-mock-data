"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const graphql_1 = require("graphql");
const casual_1 = tslib_1.__importDefault(require("casual"));
const pascal_case_1 = require("pascal-case");
const upper_case_1 = require("upper-case");
const sentence_case_1 = require("sentence-case");
const indefinite_1 = tslib_1.__importDefault(require("indefinite"));
const addPrefixToTypename = (typeName, typesPrefix) => {
    return `${typesPrefix ? typesPrefix : ''}${typeName}`;
};
const createNameConverter = (convention) => (value) => {
    switch (convention) {
        case 'upper-case#upperCase':
            return upper_case_1.upperCase(value || '');
        case 'keep':
            return value;
        case 'pascal-case#pascalCase':
        // fallthrough
        default:
            // default to pascal case in case of unknown values
            return pascal_case_1.pascalCase(value || '');
    }
};
const toMockName = (typedName, casedName, prefix, typesPrefix) => {
    if (prefix) {
        return `${prefix}${addPrefixToTypename(casedName, typesPrefix)}`;
    }
    const firstWord = sentence_case_1.sentenceCase(addPrefixToTypename(typedName, typesPrefix)).split(' ')[0];
    return `${indefinite_1.default(firstWord, { articleOnly: true })}${addPrefixToTypename(casedName, typesPrefix)}`;
};
const updateTextCase = (str, enumValuesConvention) => {
    const convert = createNameConverter(enumValuesConvention);
    if (str.charAt(0) === '_') {
        return str.replace(/^(_*)(.*)/, (_match, underscorePrefix, typeName) => `${underscorePrefix}${convert(typeName)}`);
    }
    return convert(str);
};
const hashedString = (value) => {
    let hash = 0;
    if (value.length === 0) {
        return hash;
    }
    for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i);
        // eslint-disable-next-line no-bitwise
        hash = (hash << 5) - hash + char;
        // eslint-disable-next-line no-bitwise
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};
const getScalarDefinition = (value) => {
    if (typeof value === 'string') {
        return {
            generator: value,
            arguments: [],
        };
    }
    return value;
};
const getNamedType = (typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, namedType, customScalars, typesPrefix) => {
    if (!namedType) {
        return '';
    }
    casual_1.default.seed(hashedString(typeName + fieldName));
    const name = namedType.name.value;
    switch (name) {
        case 'String':
            return `'${casual_1.default.word}'`;
        case 'Float':
            return Math.round(casual_1.default.double(0, 10) * 100) / 100;
        case 'ID':
            return `'${casual_1.default.uuid}'`;
        case 'Boolean':
            return casual_1.default.boolean;
        case 'Int':
            return casual_1.default.integer(0, 9999);
        default: {
            const foundType = types.find((enumType) => enumType.name === name);
            if (foundType) {
                switch (foundType.type) {
                    case 'enum': {
                        // It's an enum
                        const typenameConverter = createNameConverter(typenamesConvention);
                        const value = foundType.values ? foundType.values[0] : '';
                        const enumWithPrefix = addPrefixToTypename(typenameConverter(foundType.name), typesPrefix);
                        return `${enumWithPrefix}.${updateTextCase(value, enumValuesConvention)}`;
                    }
                    case 'union':
                        // Return the first union type node.
                        return getNamedType(typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, foundType.types && foundType.types[0]);
                    case 'scalar': {
                        const customScalar = customScalars ? getScalarDefinition(customScalars[foundType.name]) : null;
                        // it's a scalar, let's use a string as a value if there is no custom
                        // mapping for this particular scalar
                        if (!customScalar || !customScalar.generator) {
                            if (foundType.name === 'Date') {
                                return `'${new Date(casual_1.default.unix_time).toISOString()}'`;
                            }
                            return `'${casual_1.default.word}'`;
                        }
                        // If there is a mapping to a `casual` type, then use it and make sure
                        // to call it if it's a function
                        const embeddedGenerator = casual_1.default[customScalar.generator];
                        if (!embeddedGenerator && customScalar.generator) {
                            return customScalar.generator;
                        }
                        const generatorArgs = Array.isArray(customScalar.arguments)
                            ? customScalar.arguments
                            : [customScalar.arguments];
                        const value = typeof embeddedGenerator === 'function'
                            ? embeddedGenerator(...generatorArgs)
                            : embeddedGenerator;
                        if (typeof value === 'string') {
                            return `'${value}'`;
                        }
                        if (typeof value === 'object') {
                            return `${JSON.stringify(value)}`;
                        }
                        return value;
                    }
                    default:
                        throw `foundType is unknown: ${foundType.name}: ${foundType.type}`;
                }
            }
            if (terminateCircularRelationships) {
                return `relationshipsToOmit.has('${name}') ? {} as ${addPrefixToTypename(name, typesPrefix)} : ${toMockName(name, name, prefix, typesPrefix)}({}, relationshipsToOmit)`;
            }
            else {
                return `${toMockName(name, name, prefix, typesPrefix)}()`;
            }
        }
    }
};
const generateMockValue = (typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, currentType, customScalars, typesPrefix) => {
    switch (currentType.kind) {
        case 'NamedType':
            return getNamedType(typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, currentType, customScalars, typesPrefix);
        case 'NonNullType':
            return generateMockValue(typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, currentType.type, customScalars, typesPrefix);
        case 'ListType': {
            const value = generateMockValue(typeName, fieldName, types, typenamesConvention, enumValuesConvention, terminateCircularRelationships, prefix, currentType.type, customScalars, typesPrefix);
            return `[${value}]`;
        }
    }
};
const getMockString = (typeName, fields, typenamesConvention, terminateCircularRelationships, addTypename = false, prefix, typesPrefix = '') => {
    const casedName = createNameConverter(typenamesConvention)(typeName);
    const typename = addTypename ? `\n        __typename: '${casedName}',` : '';
    const typenameReturnType = addTypename ? `{ __typename: '${casedName}' } & ` : '';
    if (terminateCircularRelationships) {
        return `
export const ${toMockName(typeName, casedName, prefix, typesPrefix)} = (overrides?: Partial<${typesPrefix}${casedName}>, relationshipsToOmit: Set<string> = new Set()): ${typenameReturnType}${typesPrefix}${casedName} => {
    relationshipsToOmit.add('${casedName}');
    return {${typename}
${fields}
    };
};`;
    }
    else {
        return `
export const ${toMockName(typeName, casedName, prefix, typesPrefix)} = (overrides?: Partial<${typesPrefix}${casedName}>): ${typenameReturnType}${typesPrefix}${casedName} => {
    return {${typename}
${fields}
    };
};`;
    }
};
// This plugin was generated with the help of ast explorer.
// https://astexplorer.net
// Paste your graphql schema in it, and you'll be able to see what the `astNode` will look like
exports.plugin = (schema, documents, config) => {
    const printedSchema = graphql_1.printSchema(schema); // Returns a string representation of the schema
    const astNode = graphql_1.parse(printedSchema); // Transforms the string into ASTNode
    const enumValuesConvention = config.enumValues || 'pascal-case#pascalCase';
    const typenamesConvention = config.typenames || 'pascal-case#pascalCase';
    // List of types that are enums
    const types = [];
    const visitor = {
        EnumTypeDefinition: (node) => {
            const name = node.name.value;
            if (!types.find((enumType) => enumType.name === name)) {
                types.push({
                    name,
                    type: 'enum',
                    values: node.values ? node.values.map((node) => node.name.value) : [],
                });
            }
        },
        UnionTypeDefinition: (node) => {
            const name = node.name.value;
            if (!types.find((enumType) => enumType.name === name)) {
                types.push({
                    name,
                    type: 'union',
                    types: node.types,
                });
            }
        },
        FieldDefinition: (node) => {
            const fieldName = node.name.value;
            return {
                name: fieldName,
                mockFn: (typeName) => {
                    const value = generateMockValue(typeName, fieldName, types, typenamesConvention, enumValuesConvention, !!config.terminateCircularRelationships, config.prefix, node.type, config.scalars, config.typesPrefix);
                    return `        ${fieldName}: overrides && overrides.hasOwnProperty('${fieldName}') ? overrides.${fieldName}! : ${value},`;
                },
            };
        },
        InputObjectTypeDefinition: (node) => {
            const fieldName = node.name.value;
            return {
                typeName: fieldName,
                mockFn: () => {
                    const mockFields = node.fields
                        ? node.fields
                            .map((field) => {
                            const value = generateMockValue(fieldName, field.name.value, types, typenamesConvention, enumValuesConvention, !!config.terminateCircularRelationships, config.prefix, field.type, config.scalars, config.typesPrefix);
                            return `        ${field.name.value}: overrides && overrides.hasOwnProperty('${field.name.value}') ? overrides.${field.name.value}! : ${value},`;
                        })
                            .join('\n')
                        : '';
                    return getMockString(fieldName, mockFields, typenamesConvention, !!config.terminateCircularRelationships, false, config.prefix, config.typesPrefix);
                },
            };
        },
        ObjectTypeDefinition: (node) => {
            // This function triggered per each type
            const typeName = node.name.value;
            if (typeName === 'Query' || typeName === 'Mutation') {
                return null;
            }
            const { fields } = node;
            return {
                typeName,
                mockFn: () => {
                    const mockFields = fields ? fields.map(({ mockFn }) => mockFn(typeName)).join('\n') : '';
                    return getMockString(typeName, mockFields, typenamesConvention, !!config.terminateCircularRelationships, !!config.addTypename, config.prefix, config.typesPrefix);
                },
            };
        },
        ScalarTypeDefinition: (node) => {
            const name = node.name.value;
            if (!types.find((enumType) => enumType.name === name)) {
                types.push({
                    name,
                    type: 'scalar',
                });
            }
        },
    };
    const result = graphql_1.visit(astNode, { leave: visitor });
    const definitions = result.definitions.filter((definition) => !!definition);
    const typesFile = config.typesFile ? config.typesFile.replace(/\.[\w]+$/, '') : null;
    const typenameConverter = createNameConverter(typenamesConvention);
    const typeImports = definitions
        .map(({ typeName }) => typenameConverter(typeName))
        .filter((typeName) => !!typeName);
    typeImports.push(...types.filter(({ type }) => type !== 'scalar').map(({ name }) => typenameConverter(name)));
    // List of function that will generate the mock.
    // We generate it after having visited because we need to distinct types from enums
    const mockFns = definitions.map(({ mockFn }) => mockFn).filter((mockFn) => !!mockFn);
    const typesFileImport = typesFile
        ? `/* eslint-disable @typescript-eslint/no-use-before-define,@typescript-eslint/no-unused-vars,no-prototype-builtins */
import { ${typeImports
            .map((typename) => addPrefixToTypename(typename, config.typesPrefix))
            .join(', ')} } from '${typesFile}';\n`
        : '';
    return `${typesFileImport}${mockFns.map((mockFn) => mockFn()).join('\n')}
`;
};
//# sourceMappingURL=index.js.map