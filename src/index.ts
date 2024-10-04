import { JSDOM } from "jsdom";

const AllClassesIndexURL = "https://docs.oracle.com/en/java/javase/21/docs/api/allclasses-index.html";

// (async () => {
//   const { window } = await JSDOM.fromURL(AllClassesIndexURL);
// })();

function getNote(elm: Element, title: string): Element[] {
  const children = [...elm.children];
  const titleIdx = children.findIndex(i => i.textContent === title);
  if (titleIdx === -1) return [];
  const elms = [];
  let i = 1;
  while (true) {
    let c = children[titleIdx + i];
    if (!c || c.nodeName !== "DD") break;
    elms.push(c);
    i++
  }
  return elms;
}

function clean(str: string) {
  if (!str) return str;
  return str.replace(/\s+/g, " ").trim();
}

async function resolveObject(url: string) {
  const { window: { document } } = await JSDOM.fromURL(url);

  const modulePath = document.querySelector('main .sub-title [href*="module"]').textContent;
  const packagePath = document.querySelector('main .sub-title [href*="package"]').textContent;
  const fullPath = [...document.querySelectorAll('main > [title="Inheritance Tree"] .inheritance')].at(-1).textContent.replace(/<.+>/, "").trim();
  const modifiers = document.querySelector(".class-description > .type-signature > .modifiers").textContent.split(" ").filter(Boolean);
  const name = document.querySelector(".class-description > .type-signature > .type-name-label").textContent.replace(/<.+>/, "").trim();

  const extendedClasses = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="class in"]') as NodeListOf<HTMLAnchorElement>)].map(elm => {
    const title = elm.title.split(" ");
    return `${title.pop()}.${elm.textContent.trim()}`;
  });

  const implementedInterfaces = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="interface in"]') as NodeListOf<HTMLAnchorElement>)].map(elm => {
    const title = elm.title.split(" ");
    return `${title.pop()}.${elm.textContent.trim()}`;
  });

  const description = clean(document.querySelector(".class-description > .block").textContent.trim());

  const notesElm = document.querySelector(".class-description .notes");

  const since = getNote(notesElm, "Since:")[0]?.textContent || null;

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
    since,
    constructors: [...document.querySelectorAll(".constructor-details .member-list li")].map(i => {
      const notesElm = i.querySelector(".notes");
      // TODO: parse constructor parameters with types
      return {
        modifiers: i.querySelector(".member-signature .modifiers").textContent.split(" ").filter(Boolean),
        description: clean(i.querySelector(".block").textContent.trim()),
        ...(notesElm ? {
          apiNote: clean(getNote(notesElm, "API Note:")[0]?.textContent) || null,
          throws: getNote(notesElm, "Throws:").map(t => {
            const a = t.querySelector("code a") as HTMLAnchorElement;
            return {
              name: `${a.title.split(" ").pop()}.${a.textContent.trim()}`,
              description: clean(t.textContent.split(" - ")[1])
            }
          })
        } : {
          apiNote: null,
          throws: []
        })
      };
    }),
  }
}

resolveObject("https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashSet.html").then(console.log);