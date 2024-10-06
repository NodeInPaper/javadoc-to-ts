import { JSDOM } from "jsdom";
import { resolveObject } from "./javadocParser";
import { quickForEach } from "async-and-quick";
import fs from "fs";

const AllClassesIndexURL = "https://docs.oracle.com/en/java/javase/21/docs/api/allclasses-index.html";

(async () => {
  const { window: { document } } = await JSDOM.fromURL(AllClassesIndexURL);

  const objects = [];

  let idx = 0;
  await quickForEach(
    [...document.querySelectorAll('#all-classes-table .col-first a[title]') as NodeListOf<HTMLAnchorElement>],
    async (elm, _, arr) => {
      try {
        const obj = await resolveObject(elm.href);
        console.log(`[${idx++}/${arr.length}] Resolved ${obj.path}`);
        if (idx % 50 === 0) global.gc();
        objects.push(obj);
      } catch (e) {
        console.error(`Error resolving ${elm.href}`);
        console.error(e);
      }
    },
    10
  );

  await fs.promises.writeFile("objects.json", JSON.stringify(objects, null, 2));
  console.log("Done!");
})();