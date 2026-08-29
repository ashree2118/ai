import assert from "node:assert/strict";
import test from "node:test";
import {
  isTestCommand,
  readSandboxConfig,
  shouldSandboxTests,
} from "./config.js";
import { formatSandboxOutput } from "./executor.js";

test("isTestCommand detects common repository test commands", () => {
  assert.equal(isTestCommand("npm test"), true);
  assert.equal(isTestCommand("node --test dist/app.test.js"), true);
  assert.equal(isTestCommand("npx vitest run"), true);
  assert.equal(isTestCommand("ls -la"), false);
});

test("readSandboxConfig applies defaults and env overrides", () => {
  const previous = {
    image: process.env.SANDBOX_IMAGE,
    cpu: process.env.SANDBOX_CPU,
    memory: process.env.SANDBOX_MEMORY,
    network: process.env.SANDBOX_NETWORK,
  };

  process.env.SANDBOX_IMAGE = "node:20-alpine";
  process.env.SANDBOX_CPU = "0.5";
  process.env.SANDBOX_MEMORY = "256m";
  process.env.SANDBOX_NETWORK = "none";

  try {
    const config = readSandboxConfig();
    assert.equal(config.image, "node:20-alpine");
    assert.equal(config.cpus, "0.5");
    assert.equal(config.memory, "256m");
    assert.equal(config.network, "none");
  } finally {
    if (previous.image === undefined) delete process.env.SANDBOX_IMAGE;
    else process.env.SANDBOX_IMAGE = previous.image;
    if (previous.cpu === undefined) delete process.env.SANDBOX_CPU;
    else process.env.SANDBOX_CPU = previous.cpu;
    if (previous.memory === undefined) delete process.env.SANDBOX_MEMORY;
    else process.env.SANDBOX_MEMORY = previous.memory;
    if (previous.network === undefined) delete process.env.SANDBOX_NETWORK;
    else process.env.SANDBOX_NETWORK = previous.network;
  }
});

test("shouldSandboxTests respects SANDBOX_TESTS env", () => {
  const previous = process.env.SANDBOX_TESTS;
  process.env.SANDBOX_TESTS = "1";
  try {
    assert.equal(shouldSandboxTests(), true);
  } finally {
    if (previous === undefined) delete process.env.SANDBOX_TESTS;
    else process.env.SANDBOX_TESTS = previous;
  }
});

test("formatSandboxOutput includes sandbox metadata", () => {
  const formatted = formatSandboxOutput({
    exitCode: 1,
    output: "2 failing tests",
    timedOut: false,
    containerName: "token-lab-sandbox-abcd1234",
  });

  assert.match(formatted, /\[sandbox\]/);
  assert.match(formatted, /exit_code=1/);
  assert.match(formatted, /2 failing tests/);
});
