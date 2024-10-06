import fs from "fs";
import path from "path";
import { resolveObject } from "./javadocParser";
import { escapeRegex } from "stuffs";

const data = fs.readFileSync(path.resolve(__dirname, "../data/java-21.json"), "utf-8");
console.log("Data loaded");
const objects = JSON.parse(data) as Awaited<ReturnType<typeof resolveObject>>[];

function objPathToObjId(objPath: string) {
  if (!objPath) return "any";
  const found = objects.find(i => i.path === objPath);
  if (found) {
    return found.path.replace(new RegExp(`${escapeRegex(`.${found.name}`)}$`), "").split(".").map(i => i.charAt(0).toLowerCase()).join("") + found.name.replaceAll(".", "");
  }
  const splitted = objPath.split(".");
  return `${splitted.slice(0, -1).map(i => i.charAt(0).toLowerCase()).join("")}${splitted.pop()}`;
}

const javaToJSMap = {
  "void": "void",
  "boolean": "boolean",
  "byte": "number",
  "short": "number",
  "int": "number",
  "long": "bigint",
  "float": "number",
  "double": "number",
  "char": "string",
  "String": "string",
  "Object": "any",
  "Throwable": "Error",
  "Exception": "Error",
  "Error": "Error",
  "RuntimeException": "Error"
}

const jsKeywords = [
  "any",
  "unknown",
  "void",
  "boolean",
  "number",
  "bigint",
  "string",
  "symbol",
  "null",
  "undefined",
  "object",
  "never",
  "this",
  "true",
  "false",
  "keyof",
  "unique",
  "readonly",
  "readonly",
  "abstract",
  "as",
  "asserts",
  "async",
  "await",
  "constructor",
  "declare",
  "enum",
  "export",
  "from",
  "get",
  "global",
  "implements",
  "import",
  "infer",
  "interface",
  "is",
  "keyof",
  "module",
  "namespace",
  "never",
  "new",
  "readonly",
  "require",
  "type",
  "typeof",
  "unique",
  "unknown",
  "var",
  "void",
  "with",
  "yield",
  "class",
  "const",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "super",
  "this",
  "implements",
  "interface",
  "in",
  "of",
  "instanceof",
  "keyof",
  "new"
]

let resultText = "";

function resolveType(type: any) {
  return javaToJSMap[type.name] || objPathToObjId(type.path) || "any";
}

objects.forEach(obj => {
  let text = "";
  text += `/**
 * ${obj.path}
 * ${obj.description}
 * ${obj.since ? `@since ${obj.since}` : ""}
 * ${obj.deprecation ? `@deprecated ${obj.deprecation.title}${obj.deprecation.description ? ` - ${obj.deprecation.description}` : ""}` : ""}
 */\n`;
  const j = JSON.stringify(obj);
  if (j.includes("<") || j.includes(">")) return;
  text += `export ${obj.implements.length ? `abstract ` : ""}class ${objPathToObjId(obj.path)}${obj.extends ? ` extends ${objPathToObjId(obj.extends)}` : ""}${obj.implements.length ? ` implements ${obj.implements.map(i => objPathToObjId(i)).join(", ")} ` : " "}{\n`;
  [].concat(obj.fields).concat(obj.constants).forEach(field => {
    const tsModifiers = field.modifiers.map(i => i === "final" ? "readonly" : i).filter(i => !["transient", "volatile", "default"].includes(i)).join(" ");
    if (field.deprecation)
      text += `/** @deprecated ${field.deprecation.title}${field.deprecation.description ? ` - ${field.deprecation.description}` : ""} */\n`
    text += ` ${tsModifiers} ${field.name}: ${resolveType(field.type)};\n`;
  });
  obj.constructors.forEach(constructor => {
    const tsModifiers = constructor.modifiers.map(i => i === "final" ? "readonly" : i).join(" ");
    if (constructor.deprecation)
      text += `/** @deprecated ${constructor.deprecation.title}${constructor.deprecation.description ? ` - ${constructor.deprecation.description}` : ""} */\n`
    text += ` ${tsModifiers} constructor(${constructor.params.map(param => `${jsKeywords.includes(param.name) ? "_" : ""}${param.name}: ${resolveType(param.type)}`).join(", ")});\n`;
  });
  obj.methods.forEach(method => {
    const tsModifiers = method.modifiers.map(i => i === "final" ? "readonly" : i).filter(i => !["transient", "volatile", "default"].includes(i)).join(" ");
    if (method.deprecation)
      text += `/** @deprecated ${method.deprecation.title}${method.deprecation.description ? ` - ${method.deprecation.description}` : ""} */\n`
    text += ` ${tsModifiers} ${method.name}(${method.params.map(param => `${jsKeywords.includes(param.name) ? "_" : ""}${param.name}: ${resolveType(param.type)}`).join(", ")}): ${resolveType(method.returns)};\n`;
  });
  text += "}\n\n";

  resultText += text;
});

fs.writeFileSync("result.d.ts", resultText);