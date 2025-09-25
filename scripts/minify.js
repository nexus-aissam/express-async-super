#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

/**
 * Advanced minification script for NAPS Payments package
 * Removes whitespace, comments, optimizes code, and creates minified versions
 */

const buildDir = path.join(__dirname, '../dist');

// Terser/UglifyJS configuration for aggressive minification
const minifyOptions = {
  compress: {
    drop_console: false, // Keep console logs for now (can be changed)
    drop_debugger: true,
    dead_code: true,
    conditionals: true,
    evaluate: true,
    booleans: true,
    loops: true,
    unused: true,
    hoist_funs: true,
    keep_fargs: false,
    hoist_vars: false,
    if_return: true,
    join_vars: true,
    side_effects: false,
    warnings: false,
    pure_getters: true,
    unsafe: false,
    unsafe_comps: false,
    unsafe_math: false,
    unsafe_proto: false,
    passes: 2,
  },
  mangle: {
    toplevel: true,
    keep_fnames: false,
    reserved: ['exports', 'require', 'module', '__dirname', '__filename'],
  },
  format: {
    comments: false,
    beautify: false,
    semicolons: true,
  },
  sourceMap: false,
  toplevel: true,
};

/**
 * Get all JavaScript files in build directory
 */
function getJsFiles(dir) {
  const files = [];

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.js') && !item.includes('.min.')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Minify a single JavaScript file
 */
async function minifyFile(filePath) {
  try {
    console.log(`🔧 Minifying: ${path.relative(buildDir, filePath)}`);

    const originalCode = fs.readFileSync(filePath, 'utf-8');
    const originalSize = Buffer.byteLength(originalCode, 'utf8');

    // Minify the code
    const minified = await minify(originalCode, minifyOptions);

    if (minified.error) {
      console.error(`❌ Error minifying ${filePath}:`, minified.error);
      return;
    }

    const minifiedSize = Buffer.byteLength(minified.code, 'utf8');
    const compressionRatio = (((originalSize - minifiedSize) / originalSize) * 100).toFixed(1);

    // // Create .min.js version
    // const minFilePath = filePath.replace('.js', '.min.js');
    // fs.writeFileSync(minFilePath, minified.code);

    // Overwrite original with minified version (more aggressive)
    fs.writeFileSync(filePath, minified.code);

    console.log(
      `✅ ${path.relative(buildDir, filePath)}: ${originalSize}B → ${minifiedSize}B (${compressionRatio}% reduction)`
    );

    return {
      original: originalSize,
      minified: minifiedSize,
      ratio: compressionRatio,
    };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

/**
 * Main minification process
 */
async function minifyAllFiles() {
  console.log('🚀 Starting NAPS Payments minification process...\n');

  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory not found. Run "npm run build" first.');
    process.exit(1);
  }

  const jsFiles = getJsFiles(buildDir);

  if (jsFiles.length === 0) {
    console.log('⚠️  No JavaScript files found in build directory.');
    return;
  }

  console.log(`📁 Found ${jsFiles.length} JavaScript files to minify\n`);

  let totalOriginal = 0;
  let totalMinified = 0;
  let processedFiles = 0;

  // Process files sequentially to avoid overwhelming the system
  for (const filePath of jsFiles) {
    const result = await minifyFile(filePath);
    if (result) {
      totalOriginal += result.original;
      totalMinified += result.minified;
      processedFiles++;
    }
  }

  // Summary
  const totalReduction =
    totalOriginal > 0 ? (((totalOriginal - totalMinified) / totalOriginal) * 100).toFixed(1) : 0;

  console.log('\n📊 Minification Summary:');
  console.log(`   Files processed: ${processedFiles}/${jsFiles.length}`);
  console.log(`   Total size reduction: ${totalOriginal}B → ${totalMinified}B`);
  console.log(`   Overall compression: ${totalReduction}%`);
  console.log('\n✨ Minification complete! Package is ready for production.\n');
}

// Run the minification
minifyAllFiles().catch(error => {
  console.error('💥 Minification failed:', error);
  process.exit(1);
});
