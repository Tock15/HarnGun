// Build the client, upload it to the frontend bucket, and clear CloudFront's cache.
// Needs `aws login --profile harngun` first and the stack already deployed.
import { execFileSync } from "node:child_process";

const stack = "harngun";
const profile = ["--profile", "harngun", "--region", "ap-southeast-1"];
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const physicalId = (logicalId) =>
  execFileSync("aws", ["cloudformation", "describe-stack-resource", "--stack-name", stack,
    "--logical-resource-id", logicalId, "--query", "StackResourceDetail.PhysicalResourceId",
    "--output", "text", ...profile], { encoding: "utf8" }).trim();

const bucket = physicalId("FrontendBucket");
const distribution = physicalId("FrontendDistribution");

// npm sets npm_execpath to its own JS entry point, so npm runs through node with no shell (npm.cmd needs one on Windows)
run(process.execPath, [process.env.npm_execpath, "run", "build", "--workspace", "client"]);
// --delete removes old hashed bundles so the bucket holds only the current build
run("aws", ["s3", "sync", "client/dist", `s3://${bucket}`, "--delete", ...profile]);
run("aws", ["cloudfront", "create-invalidation", "--distribution-id", distribution, "--paths", "/*", ...profile]);
