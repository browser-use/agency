import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterForCard } from "../lib/card-cluster.ts";

test("category prefix decides the cluster", () => {
  assert.equal(clusterForCard({ category: "Growth · X reply" }), "growth");
  assert.equal(clusterForCard({ category: "Distribution · X reply" }), "growth");
  assert.equal(clusterForCard({ category: "Support · Pylon · exact reply" }), "support");
  assert.equal(clusterForCard({ category: "Fix · observability · worker" }), "fix");
  assert.equal(clusterForCard({ category: "Product · pitch · replay" }), "product");
});

test("legacy categories fall back to keywords", () => {
  assert.equal(clusterForCard({ category: "V4 reliability · browser handoff" }), "fix");
  assert.equal(clusterForCard({ category: "Named customer · support · exact reply" }), "support");
  assert.equal(clusterForCard({ category: "OSS · stealth · contributor PR" }), "fix");
  assert.equal(clusterForCard({ category: "Cloud · free plan · product decision", headline: "Decide who gets the $15" }), "product");
  assert.equal(clusterForCard({ category: "Example team · blank capture · clarification" }), ""); // no keyword matches: unfiled, shows only under All
  assert.equal(clusterForCard({ category: "GLM 5.3 Flash · X quote staging" }), "growth");
});
