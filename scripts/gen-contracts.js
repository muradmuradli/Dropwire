#!/usr/bin/env node
'use strict';

// Generates TypeScript from contracts/proto/ and contracts/events/ into each consuming
// service's own src/generated/ (gitignored, regenerated on demand — never a shared runtime
// package). See CLAUDE.md's "no code sharing between services" rule and
// docs/decisions/0009-codegen-setup.md for why this script is shaped the way it is.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { compileFromFile } = require('json-schema-to-typescript');

const ROOT = path.resolve(__dirname, '..');
const PROTO_ROOT = path.join(ROOT, 'contracts', 'proto');
const PROTO_FILE = path.join(PROTO_ROOT, 'dropwire', 'inventory', 'v1', 'inventory.proto');
const EVENTS_DIR = path.join(ROOT, 'contracts', 'events');

// Every service that implements (server) or calls (client) the gRPC contract.
const PROTO_CONSUMERS = ['inventory', 'orders'];

// Every service that produces or consumes each event, per docs/event-catalog.md. A service
// needs the generated type whether it's building the event to publish it or reading one it
// received — both directions need the same shape.
const EVENT_CONSUMERS = {
  orders: [
    'order-placed',
    'inventory-reserved',
    'inventory-released',
    'payment-confirmed',
    'payment-failed',
    'payment-checkout-created',
    'order-confirmed',
    'order-cancelled',
  ],
  inventory: ['order-placed', 'inventory-reserved', 'inventory-released'],
  payments: ['inventory-reserved', 'payment-confirmed', 'payment-failed', 'payment-checkout-created'],
  notifications: ['order-confirmed', 'order-cancelled'],
};

function generatedDir(service, ...parts) {
  return path.join(ROOT, 'services', service, 'src', 'generated', ...parts);
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function genProto() {
  // pnpm only generates the .cmd shim on Windows; Linux (and Docker builds, which are
  // always Linux) gets the plain executable with no extension.
  const binExt = process.platform === 'win32' ? '.cmd' : '';
  const protocBin = path.join(ROOT, 'node_modules', '.bin', `grpc_tools_node_protoc${binExt}`);
  const pluginBin = path.join(ROOT, 'node_modules', '.bin', `protoc-gen-ts_proto${binExt}`);

  for (const service of PROTO_CONSUMERS) {
    const outDir = generatedDir(service, 'proto');
    cleanDir(outDir);
    // shell: true is required for protoc (a native binary) to spawn the ts-proto plugin's
    // .cmd shim on Windows. Every argument below is a fixed, internally-built string — no
    // external input reaches this call — so there's nothing for shell interpretation to
    // inject.
    execFileSync(
      protocBin,
      [
        `--plugin=protoc-gen-ts_proto=${pluginBin}`,
        `--ts_proto_out=${outDir}`,
        '--ts_proto_opt=nestJs=true,outputServices=grpc-js',
        `--proto_path=${PROTO_ROOT}`,
        PROTO_FILE,
      ],
      { stdio: 'inherit', shell: true },
    );
    const relOutFile = path.relative(PROTO_ROOT, PROTO_FILE).replace(/\.proto$/, '.ts');
    console.log(`[proto]  services/${service}/src/generated/proto/${relOutFile.replace(/\\/g, '/')}`);
  }
}

async function genEvents() {
  for (const [service, events] of Object.entries(EVENT_CONSUMERS)) {
    const outDir = generatedDir(service, 'events');
    cleanDir(outDir);
    for (const event of events) {
      const schemaPath = path.join(EVENTS_DIR, `${event}.schema.json`);
      const ts = await compileFromFile(schemaPath, { cwd: EVENTS_DIR });
      fs.writeFileSync(path.join(outDir, `${event}.ts`), ts);
    }
    console.log(`[events] services/${service}/src/generated/events/ (${events.length} type(s))`);
  }
}

async function main() {
  const target = process.argv[2];
  if (target === 'proto') {
    genProto();
  } else if (target === 'events') {
    await genEvents();
  } else {
    genProto();
    await genEvents();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
