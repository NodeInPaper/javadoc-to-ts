import { JSDOM } from "jsdom";

function getNote(elm: Element, title: string): Element[] {
  if (!elm) return [];
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

function parseType(typeString: string) {
  if (!typeString) return null;
  typeString = typeString.replace(/@[\w.]+/g, '').trim();
  if (!typeString) return null;
  const genericMatch = typeString.match(/([\w.]+|[?])(\[\])?(<(.+)>)?/);


  if (genericMatch?.[3]) {
    return {
      name: genericMatch[1],
      isArray: !!genericMatch[2],
      params: genericMatch[3].split(',').map(generic => {
        const match = generic.trim().match(/(\?|[\w.]+)\s*(extends|super)?\s*([\w.]+)?/);
        return {
          name: match[1],
          type: match[2] || null,
          otherName: match[3] || null,
        };
      }),
    };
  }

  return {
    name: genericMatch[1],
    isArray: !!genericMatch[2],
    params: []
  };
}

function parseParameters(paramsElm: Element, notesElm?: Element) {
  if (!paramsElm) return [];
  const result = [];

  const paramString = paramsElm.textContent.replace(/[()]/g, '').trim();
  const params = paramString.split(',').map(param => param.trim());

  const paramNotes = notesElm ? getNote(notesElm, "Parameters:").map(p => ({
    name: p.querySelector("code").textContent.trim(),
    description: clean(p.textContent.split(" - ")[1])
  })) : [];

  const remoteParamTypes = [...paramsElm.querySelectorAll('a[title]')].map(objectLinkToPath);

  params.forEach(param => {
    const split = param.split(/\s+/);
    const name = split.pop();
    const typeString = split.join(' ');

    const type = parseType(typeString);
    if (!type) return;

    result.push({
      name,
      type: {
        ...type,
        path: remoteParamTypes.find(i => i.endsWith(`.${type.name}`)) || null
      },
      description: paramNotes.find(n => n.name === name)?.description || null
    });
  });

  return result;
}

function objectLinkToPath(elm: HTMLAnchorElement) {
  const title = elm.title.split(" ");
  return `${title.pop()}.${elm.textContent.trim()}`;
}

async function fetchHTMLRetry(url: string, t = 0) {
  try {
    return await JSDOM.fromURL(url);
  } catch (e) {
    await new Promise(r => setTimeout(r, t * 1000));
    if (t >= 5) throw e;
    return fetchHTMLRetry(url, t + 1);
  }
}

export async function resolveObject(url: string) {
  const dom = await fetchHTMLRetry(url);
  const document = dom.window.document;

  const modulePath = document.querySelector('main .sub-title [href*="module"]')?.textContent || null;
  const packagePath = document.querySelector('main .sub-title [href*="package"]').textContent;
  const modifiers = document.querySelector(".class-description > .type-signature > .modifiers").textContent.split(" ").filter(Boolean);
  const name = document.querySelector(".class-description > .type-signature > .type-name-label").textContent.replace(/<.+>/, "").trim();

  const fullPath = (() => {
    const last = [...document.querySelectorAll('main > [title="Inheritance Tree"] .inheritance')].at(-1);
    if (!last) return `${packagePath}.${name}`;
    return last.textContent.replace(/<.+>/, "").trim();
  })();

  const extendedClasses = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="class in"]') as NodeListOf<HTMLAnchorElement>)].map(objectLinkToPath);

  const implementedInterfaces = [...(document.querySelectorAll('.type-signature > .extends-implements [title^="interface in"]') as NodeListOf<HTMLAnchorElement>)].map(objectLinkToPath);

  const description = clean(document.querySelector(".class-description > .block")?.textContent?.trim()) || null;

  const notesElm = document.querySelector(".class-description .notes");

  const since = getNote(notesElm, "Since:")[0]?.textContent || null;

  const obj = {
    type: (modifiers.includes("interface") ? "Interface" : modifiers.includes("enum") ? "Enum" : modifiers.includes("record") ? "Record" : "Class") as "Class" | "Interface" | "Enum" | "Record",
    module: modulePath,
    package: packagePath,
    name,
    path: fullPath,
    modifiers,
    extends: extendedClasses[0] || null,
    implements: implementedInterfaces,
    deprecation: (() => {
      const deprecationElm = document.querySelector(".class-description > .deprecation-block");
      if (!deprecationElm) return null;
      return {
        title: clean(deprecationElm.querySelector(".deprecated-label")?.textContent) || null,
        description: clean(deprecationElm.querySelector(".deprecation-comment")?.textContent) || null
      }
    })(),
    description,
    since,
    constructors: [...document.querySelectorAll(".constructor-details .member-list li")].map(i => {
      const notesElm = i.querySelector(".notes");
      const modifiersElm = i.querySelector(".member-signature .modifiers");
      if (!modifiersElm) return;
      const paramsElm = i.querySelector(".member-signature .parameters");
      const deprecationElm = i.querySelector(".deprecation-block");
      return {
        modifiers: modifiersElm ? modifiersElm.textContent.split(" ").filter(Boolean) : [],
        params: paramsElm ? parseParameters(paramsElm, notesElm) : [],
        description: clean(i.querySelector(".block")?.textContent?.trim?.()) || null,
        deprecation: deprecationElm ? {
          title: clean(deprecationElm.querySelector(".deprecated-label")?.textContent) || null,
          description: clean(deprecationElm.querySelector(".deprecation-comment")?.textContent) || null
        } : null,
        ...(notesElm ? {
          apiNote: clean(getNote(notesElm, "API Note:")[0]?.textContent) || null,
          throws: getNote(notesElm, "Throws:").map(t => {
            const a = t.querySelector("code a") as HTMLAnchorElement;
            if (!a) return null;
            return {
              path: `${a.title.split(" ").pop()}.${a.textContent.trim()}`,
              description: clean(t.textContent.split(" - ")[1])
            }
          }).filter(Boolean)
        } : {
          apiNote: null,
          throws: []
        })
      };
    }).filter(Boolean),
    methods: [...document.querySelectorAll(".method-details .member-list li")].map(i => {
      const notesElm = i.querySelector(".notes");
      const modifiersElm = i.querySelector(".member-signature .modifiers");
      if (!modifiersElm) return;
      const paramsElm = i.querySelector(".member-signature .parameters");
      const returnsElm = i.querySelector(".member-signature .return-type");
      const typeParamsElm = i.querySelector(".member-signature .type-parameters");
      const nameElm = i.querySelector(".member-signature .element-name");
      const deprecationElm = i.querySelector(".deprecation-block");
      return {
        modifiers: modifiersElm ? modifiersElm.textContent.split(" ").filter(Boolean) : [],
        name: nameElm.textContent.trim(),
        params: paramsElm ? parseParameters(paramsElm, notesElm) : [],
        typeParams: typeParamsElm ? typeParamsElm.textContent.replace(/[<>]/g, "").split(",").map(i => i.trim()) : [],
        returns: returnsElm ? (() => {
          const type = parseType(returnsElm.textContent);
          const remoteTypes = [...returnsElm.querySelectorAll('a[title]')].map(objectLinkToPath);
          return {
            ...type,
            path: remoteTypes.find(i => i.endsWith(`.${type.name}`)) || null,
            description: clean(getNote(notesElm, "Returns:")[0]?.textContent) || null
          }
        })() : null,
        description: clean(i.querySelector(".block")?.textContent?.trim?.()) || null,
        deprecation: deprecationElm ? {
          title: clean(deprecationElm.querySelector(".deprecated-label")?.textContent) || null,
          description: clean(deprecationElm.querySelector(".deprecation-comment")?.textContent) || null
        } : null,
        ...(notesElm ? {
          apiNote: clean(getNote(notesElm, "API Note:")[0]?.textContent) || null,
          throws: getNote(notesElm, "Throws:").map(t => {
            const a = t.querySelector("code a") as HTMLAnchorElement;
            if (!a) return null;
            return {
              path: `${a.title.split(" ").pop()}.${a.textContent.trim()}`,
              description: clean(t.textContent.split(" - ")[1])
            }
          }).filter(Boolean)
        } : {
          apiNote: null,
          throws: []
        })
      };
    }).filter(Boolean),
    fields: [...document.querySelectorAll(".field-details .member-list li")].map(i => {
      const modifiersElm = i.querySelector(".member-signature .modifiers");
      if (!modifiersElm) return;
      const nameElm = i.querySelector(".member-signature .element-name");
      const returnsElm = i.querySelector(".member-signature .return-type");
      const deprecationElm = i.querySelector(".deprecation-block");
      return {
        modifiers: modifiersElm ? modifiersElm.textContent.split(" ").filter(Boolean) : [],
        name: nameElm.textContent.trim(),
        description: clean(i.querySelector(".block")?.textContent?.trim?.()) || null,
        deprecation: deprecationElm ? {
          title: clean(deprecationElm.querySelector(".deprecated-label")?.textContent) || null,
          description: clean(deprecationElm.querySelector(".deprecation-comment")?.textContent) || null
        } : null,
        type: returnsElm ? (() => {
          const type = parseType(returnsElm.textContent);
          const remoteTypes = [...returnsElm.querySelectorAll('a[title]')].map(objectLinkToPath);
          return {
            ...type,
            path: remoteTypes.find(i => i.endsWith(`.${type.name}`)) || null
          }
        })() : null,
      };
    }).filter(Boolean),
    constants: [...document.querySelectorAll(".constant-details .member-list li")].map(i => {
      const modifiersElm = i.querySelector(".member-signature .modifiers");
      if (!modifiersElm) return;
      const nameElm = i.querySelector(".member-signature .element-name");
      const returnsElm = i.querySelector(".member-signature .return-type");
      const deprecationElm = i.querySelector(".deprecation-block");
      return {
        modifiers: modifiersElm ? modifiersElm.textContent.split(" ").filter(Boolean) : [],
        name: nameElm.textContent.trim(),
        description: clean(i.querySelector(".block")?.textContent?.trim?.()) || null,
        deprecation: deprecationElm ? {
          title: clean(deprecationElm.querySelector(".deprecated-label")?.textContent) || null,
          description: clean(deprecationElm.querySelector(".deprecation-comment")?.textContent) || null
        } : null,
        type: returnsElm ? (() => {
          const type = parseType(returnsElm.textContent);
          const remoteTypes = [...returnsElm.querySelectorAll('a[title]')].map(objectLinkToPath);
          return {
            ...type,
            path: remoteTypes.find(i => i.endsWith(`.${type.name}`)) || null
          }
        })() : null,
      };
    }).filter(Boolean)
  }
  dom.window.close();
  // @ts-ignore
  dom.window = null;
  return obj;
}