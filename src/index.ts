import { JSDOM } from "jsdom";

const AllClassesIndexURL = "https://docs.oracle.com/en/java/javase/21/docs/api/allclasses-index.html";

(async () => {

  const { window } = await JSDOM.fromURL(AllClassesIndexURL);

})();

async function resolveClass(url: string) {
  const { window: { document } } = await JSDOM.fromURL(url);

  const modulePath = document.querySelector('main .sub-title [href*="module"]').textContent;
  const packagePath = document.querySelector('main .sub-title [href*="package"]').textContent;
  const fullPath = [...document.querySelectorAll('main > [title="Inheritance Tree"] .inheritance')].at(-1).textContent;
  const modifiers = document.querySelector(".class-description > .type-signature > .modifiers").textContent.split(" ").filter(Boolean);
  const name = document.querySelector(".class-description > .type-signature > .type-name-label").textContent.trim();

  const extendedClasses = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="class in"]') as NodeListOf<HTMLAnchorElement>)].map(elm => {
    const title = elm.title.split(" ");
    return `${title.pop()}.${elm.textContent.trim()}`;
  });

  const implementedInterfaces = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="interface in"]') as NodeListOf<HTMLAnchorElement>)].map(elm => {
    const title = elm.title.split(" ");
    return `${title.pop()}.${elm.textContent.trim()}`;
  });

  const description = document.querySelector(".description > .block").textContent.trim();

  const since = [...document.querySelectorAll(".class-description .notes")].find(i => i.querySelector("& > dt")?.textContent === "Since:")?.querySelector("dd")?.textContent || "N/A";

  // TODO: Constructor Details, Method Details

  return {
    type: (modifiers.includes("interface") ? "Interface" : modifiers.includes("enum") ? "Enum" : modifiers.includes("record") ? "Record" : "Class") as "Class" | "Interface" | "Enum" | "Record",
    module: modulePath,
    package: packagePath,
    name,
    path: fullPath,
    modifiers,
    extends: extendedClasses[0] || null,
    implements: implementedInterfaces,
    description,
    since
  }
}