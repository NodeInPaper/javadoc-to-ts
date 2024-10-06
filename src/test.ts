import util from 'util';
import { resolveObject } from './javadocParser';


resolveObject("https://jd.papermc.io/paper/1.21.1/org/bukkit/map/MapCursor.Type.html").then((o) => {
  console.log(util.inspect(o, false, null, true));
})