/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        verbatimModuleSyntax: false,
        module: "commonjs",
        moduleResolution: "node"
      }
    }]
  }
};
