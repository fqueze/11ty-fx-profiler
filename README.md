# 11ty-fx-profiler
Visualize how Eleventy spends its build time using markers in the Firefox Profiler.

## Usage

`npm install 11ty-fx-profiler`, then in your `.eleventy.js` (or `eleventy.config.js`) file, add:
- at the top: `import Profiler from '11ty-fx-profiler';`
- in your code, to install the profiler: `Profiler(eleventyConfig);`. Put this as the first line of the fonction that takes `eleventyConfig` as a parameter. To avoid losing data, the profiler needs to be installed before anything else calls into `eleventyConfig.benchmarkManager`.

This profiler will do nothing unless the `PROFILE` environment variable is set when running eleventy.

Possible values for the environment variable:
- `open`: this will open the profile in a new tab in your default browser. This is the best for profiling during local development.
- `stdout`: this will dump the entire profile JSON into the build log. Might be useful to profile what's happening when deploying.
- any other value will be treated as a file name, and the profile will be saved to a file with that name.

For example, assuming you use `yarn build` to build your Eleventy website, you would use `PROFILE=open yarn build` to see a profile of it.

## Adding more markers

The data already recorded by eleventy will be included, but it might be useful to include extra information for parts of your own code that could take time.

For example, if you have your own shortcode that you would like to instrument:
```
  eleventyConfig.addShortcode("shortcodename", async function(string) {
    let bench = eleventyConfig.benchmarkManager.get("User").get("> shortcodename > " + string);
    bench.before();
    /* ... */
    bench.after();
    return result;
  });
```
