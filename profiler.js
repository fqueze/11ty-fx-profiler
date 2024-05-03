const startDate = Date.now();
const startTime = performance.now();

import fs from "fs";
import open, {apps} from 'open';
import http from "http";

const baseProfile = '{"meta":{"interval":1,"startTime":0,"abi":"","misc":"","oscpu":"","platform":"","processType":0,"extensions":{"id":[],"name":[],"baseURL":[],"length":0},"categories":[{"name":"Other","color":"grey","subcategories":["Other"]}],"product":"Eleventy","stackwalk":0,"toolkit":"","version":27,"preprocessedProfileVersion":47,"appBuildID":"","sourceURL":"","physicalCPUs":0,"logicalCPUs":0,"symbolicationNotSupported":true,"markerSchema":[]},"libs":[],"pages":[],"threads":[{"processType":"default","processStartupTime":0,"processShutdownTime":null,"registerTime":0,"unregisterTime":null,"pausedRanges":[],"name":"GeckoMain","isMainThread":true,"pid":"0","tid":0,"samples":{"weightType":"samples","weight":null,"eventDelay":[],"stack":[],"time":[],"length":0},"stringArray":[],"markers":{"data":[],"name":[],"startTime":[],"endTime":[],"phase":[],"category":[],"length":0},"stackTable":{"frame":[0],"prefix":[null],"category":[0],"subcategory":[0],"length":1},"frameTable":{"address":[-1],"inlineDepth":[0],"category":[null],"subcategory":[0],"func":[0],"nativeSymbol":[null],"innerWindowID":[0],"implementation":[null],"line":[null],"column":[null],"length":1},"funcTable":{"isJS":[false],"relevantForJS":[false],"name":[0],"resource":[-1],"fileName":[null],"lineNumber":[null],"columnNumber":[null],"length":1},"resourceTable":{"lib":[],"name":[],"host":[],"type":[],"length":0},"nativeSymbols":{"libIndex":[],"address":[],"name":[],"functionSize":[],"length":0}}],"counters":[]}';

function generateProfile(loggers) {
  let endTime = performance.now();
  let profile = JSON.parse(baseProfile);
  profile.meta.startTime = startDate;
  profile.meta.profilingStartTime = 0;
  profile.meta.profilingEndTime = endTime;

  let {markers, stringArray} = profile.threads[0];
  profile.meta.markerSchema.push({
    name: "Text",
    chartLabel:"{marker.data.text}",
    tableLabel:"{marker.name} — {marker.data.text}",
    display: ["marker-chart", "marker-table"],
    data: [
      {
        key: "text",
        label: "File",
        format: "string",
        searchable: "true",
      },
    ],
  });

  let categories = new Map();
  for (let i = 0; i < profile.meta.categories.length; ++i) {
    categories.set(profile.meta.categories[i], i);
  }
  function round(time) {
    return Math.round(time * 1000) / 1000;
  }
  function addMarker(cat, name, startTime, endTime, data = {}) {
    let catId = categories.get(cat);
    if (catId === undefined) {
      catId = profile.meta.categories.length
      profile.meta.categories.push({"name":cat,"color":"grey","subcategories":["Other"]});
      categories.set(cat, catId);
    }
    markers.category.push(catId);
    markers.startTime.push(round(startTime));
    markers.endTime.push(endTime ? round(endTime) : null);
    // 0 = Instant, 1 = marker with start and end times, 2 = start but no end.
    markers.phase.push(endTime ? 1 : 0);
    let index = stringArray.indexOf(name);
    if (index == -1) {
      stringArray.push(name);
      index = stringArray.length - 1;
    }
    markers.name.push(index);
    markers.data.push(data);
    markers.length++;
  }

  const alreadyWarned = new Set();
  for (let [loggerName, {markers}] of loggers) {
    for (let [name, start, end] of markers) {
      let catName = loggerName;
      if (!start) {
        let markerName = loggerName + name;
        if (!alreadyWarned.has(markerName)) {
          alreadyWarned.add(markerName);
          console.warn("WARNING: [11ty-fx-profiler] missing start time for:",
                       loggerName, name,
                       "\n         To fix this, call .after() and .before() on the same object.");
        }
        start = end;
      }
      if (!end && name.startsWith("(count) ")) {
        name = name.slice("(count) ".length);
      }
      let data = undefined;
      if (loggerName == "Data") {
        let match = name.match(/^`(.*)`$/);
        if (match) {
          catName = "Aggregate";
          name = "Data File";
          data = {type: "Text", text: match[1]};
        }
      } else {
        let match = name.match(/^> ([^>]+) > (.*)/);
        if (match) {
          name = match[1];
          data = {type: "Text", text: match[2]};
        }
      }
      addMarker(catName, name, start, end, data);
    }
  }

  return profile;
}


const loggers = new Map();

class logger {
  constructor() {
    this.markers = [];
  }
  get(name) {
    let markers = this.markers;
    return ({
      before() {
        this.startTime = performance.now() - startTime;
      },
      after() {
        markers.push([name, this.startTime, performance.now() - startTime]);
      },
      incrementCount() {
        markers.push([name, performance.now() - startTime, null]);
      },
    });
  }
};

const benchmarkManager = {
  get(name) {
    if (!loggers.has(name)) {
      loggers.set(name, new logger());
    }
    return loggers.get(name);
  },
  setVerboseOutput() {},
  finish() {
    let profileJSON = JSON.stringify(generateProfile(loggers));
    let profileEnvVar = process.env.PROFILE;
    if (profileEnvVar == "open") {
      const server = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(profileJSON);
        server.close()
      })
      server.listen(8383, "0.0.0.0", () => {
        console.log("Opening the profile in the default browser…");
        open(`https://profiler.firefox.com/from-url/${
          encodeURIComponent("http://localhost:8383/")
        }/calltree/?v=10`);
      });
    } else if (profileEnvVar == "stdout") {
      process.stdout.write(profileJSON + "\n");
    } else {
      fs.writeFileSync(profileEnvVar, profileJSON);
      console.log("Wrote the profile to:", profileEnvVar);
      console.log("Open it in http://profiler.firefox.com/");
    }
  },
};

export default function(eleventyConfig) {
  if (process.env.PROFILE) {
    eleventyConfig.benchmarkManager = benchmarkManager;
  }
}
