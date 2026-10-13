const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Full Test Suite for Space Portfolio...');

// 1. Verify HTML Structure and Requirements
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

console.log('\n[Test 1] Verify Exactly 8 Planets/Stops and Order');
const planetRegex = /var P=\[\s*([\s\S]*?)\s*\];/;
const planetMatch = html.match(planetRegex);
assert(planetMatch, 'Planet array var P must exist in index.html');

// Check scenes in HTML
const sceneMatches = html.match(/<section class="scene/g) || [];
assert.strictEqual(sceneMatches.length, 8, `Expected exactly 8 scenes/planets, found ${sceneMatches.length}`);

// Verify order of first 7 sections
assert(html.includes('<h1>Akhil Marepalli</h1>'), 'Scene 0 (Sun) must be Hello/Introduction');
assert(html.includes('<span class="hk">Mercury</span><h2>About me</h2>'), 'Scene 1 (Mercury) must be About me');
assert(html.includes('<span class="hk">Venus</span><h2>Skills</h2>'), 'Scene 2 (Venus) must be Skills');
assert(html.includes('<span class="hk">Earth</span><h2>Projects</h2>'), 'Scene 3 (Earth) must be Projects');
assert(html.includes('<span class="hk">Mars</span><h2>Education</h2>'), 'Scene 4 (Mars) must be Education');
assert(html.includes('<span class="hk">Jupiter</span><h2>Experience</h2>'), 'Scene 5 (Jupiter) must be Experience');
assert(html.includes('<span class="hk">Saturn</span><h2>Certifications</h2>'), 'Scene 6 (Saturn) must be Certifications');

// Verify 8th planet is Hire Me (Uranus)
assert(html.includes('<span class="hk">Uranus</span><h2>Hire Me</h2>'), 'Scene 7 (Uranus) must be Hire Me');
assert(html.includes('id="hireMeBtn"'), 'Hire Me CTA button/card must exist on Uranus');
console.log('  ✅ Exactly 8 planets verified. First 7 planets unchanged; 8th is Hire Me.');

console.log('\n[Test 2] Verify Navigation Links');
const navMatches = html.match(/<nav aria-label="Sections">([\s\S]*?)<\/nav>/);
assert(navMatches, 'Navigation element must exist');
const navLinks = navMatches[1].match(/<a [^>]+>/g) || [];
assert.strictEqual(navLinks.length, 8, `Navigation must contain exactly 8 links, found ${navLinks.length}`);
assert(navLinks[7].includes('data-go="7"'), '8th link must navigate to stop 7');
assert(html.includes('Hire Me (Uranus)'), '8th link must label Hire Me (Uranus)');
console.log('  ✅ Navigation has exactly 8 links matching the 8 planets.');

console.log('\n[Test 3] Verify Astronaut Visitor Counter Removed per User Request');
assert(!html.includes('id="astro-counter"'), 'Visitor counter widget should be removed');
console.log('  ✅ Monthly Astronaut Visitor Counter UI successfully removed.');

console.log('\n[Test 4] Verify Hire Me Modal & Contact Form');
assert(html.includes('id="hire-modal"'), 'Hire Me modal container must exist');
assert(html.includes('id="hireForm"'), 'Hire Me form element must exist');
assert(html.includes('id="hm-name"'), 'Sender Name field must exist');
assert(html.includes('id="hm-email"'), 'Sender Email field must exist');
assert(html.includes('id="hm-sub"'), 'Subject field must exist');
assert(html.includes('id="hm-msg"'), 'Message field must exist');
assert(html.includes('name="hp"'), 'Spam honeypot field must exist');
assert(html.includes('id="hm-cancel"'), 'Cancel action must exist');
assert(html.includes('id="hm-send"'), 'Send action must exist');
console.log('  ✅ Hire Me Modal and Form fields verified.');

// 2. Test Backend APIs
console.log('\n[Test 5] Test Visitor Analytics Storage & Counting Logic');
const visitorsFile = path.join(__dirname, 'data', 'visitors.json');
const initialVisitorsData = fs.existsSync(visitorsFile) ? fs.readFileSync(visitorsFile, 'utf8') : null;

const store = require('./api/_store');
const testVisitor1 = 'vis_' + Math.random().toString(36).slice(2);
const testVisitor2 = 'vis_' + Math.random().toString(36).slice(2);

const r1 = store.recordVisit(testVisitor1);
assert(r1.isNew === true, 'First visit from visitor1 must be counted as new');

const r1Repeat = store.recordVisit(testVisitor1);
assert(r1Repeat.isNew === false, 'Page refresh with same visitorId must NOT be counted as new');
assert.strictEqual(r1.count, r1Repeat.count, 'Repeat visit from same visitor must not increase count');

const r2 = store.recordVisit(testVisitor2);
assert(r2.isNew === true, 'Visit from distinct visitor2 must be counted as new');
assert.strictEqual(r2.count, r1.count + 1, 'Distinct visitor must increment unique monthly count');

const countCheck = store.getVisitCount();
assert.strictEqual(countCheck.count, r2.count, 'getVisitCount must return consistent count');
console.log(`  ✅ Unique counting and refresh deduplication passed (Unique count: ${countCheck.count}).`);

console.log('\n[Test 6] Test Contact API Validation & Honeypot');
const contactHandler = require('./api/contact');

function mockReq(method, body, headers = {}) {
  const { Readable } = require('stream');
  const req = new Readable();
  req._read = () => {};
  req.method = method;
  req.headers = Object.assign({ 'content-type': 'application/json' }, headers);
  req.push(JSON.stringify(body));
  req.push(null);
  return req;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(str) { this.body = str ? JSON.parse(str) : {}; }
  };
}

(async function runApiTests() {
  try {
  // Test: Invalid email rejection
  const resBadEmail = mockRes();
  await contactHandler(mockReq('POST', {
    name: 'Test',
    email: 'not-an-email',
    subject: 'Job Opportunity',
    message: 'Hello Akhil, please contact us.'
  }), resBadEmail);
  assert.strictEqual(resBadEmail.statusCode, 400, 'Invalid email must return 400');
  assert(resBadEmail.body.error.includes('valid email'), 'Must return valid email error');

  // Test: Short message rejection
  const resShortMsg = mockRes();
  await contactHandler(mockReq('POST', {
    name: 'Test',
    email: 'recruiter@example.com',
    subject: 'Job Opportunity',
    message: 'Hi'
  }), resShortMsg);
  assert.strictEqual(resShortMsg.statusCode, 400, 'Short message must return 400');

  // Test: Honeypot silent discard
  const resHp = mockRes();
  await contactHandler(mockReq('POST', {
    name: 'Spam Bot',
    email: 'bot@spam.com',
    subject: 'Spam Link',
    message: 'Visit my spam site here now',
    hp: 'I am a bot'
  }), resHp);
  assert.strictEqual(resHp.statusCode, 200, 'Honeypot should return 200 without sending');

  // Test: Valid submission (safe dev mode test)
  process.env.NODE_ENV = 'development';
  process.env.RECIPIENT_EMAIL = 'akhimarepalli666@gmail.com';
  const resValid = mockRes();
  await contactHandler(mockReq('POST', {
    name: 'Google Recruiter',
    email: 'recruiter@google.com',
    subject: 'Software Engineer Role at Google',
    message: 'Hi Akhil, we were impressed by your space portfolio and would love to chat!'
  }), resValid);
  assert.strictEqual(resValid.statusCode, 200, 'Valid submission must return 200');
  assert(resValid.body.success, 'Valid submission must return success: true');
  console.log('  ✅ Contact API validation, honeypot spam protection, and delivery passed.');

  console.log('\n[Test 7] Test Monthly Report API & Duplicate Prevention');
  const reportHandler = require('./api/monthly-report');

  const curMonth = store.getCurrentMonthKey();
  // Send first report with force=true
  const resRep1 = mockRes();
  await reportHandler({
    method: 'GET',
    url: `/api/monthly-report?month=${curMonth}&force=true`,
    headers: { host: 'localhost' }
  }, resRep1);
  assert.strictEqual(resRep1.statusCode, 200, 'Monthly report endpoint must return 200');
  assert(resRep1.body.sent === true, 'First report must be sent');

  // Send duplicate report without force: should be prevented!
  const resRep2 = mockRes();
  await reportHandler({
    method: 'GET',
    url: `/api/monthly-report?month=${curMonth}`,
    headers: { host: 'localhost' }
  }, resRep2);
  assert.strictEqual(resRep2.statusCode, 200);
  assert.strictEqual(resRep2.body.sent, false, 'Duplicate monthly report must be blocked');
  assert(resRep2.body.message.includes('already been sent'), 'Duplicate message must indicate already sent');
  console.log('  ✅ Monthly report generated and duplicate prevention confirmed.');

  console.log('\n🎉 ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!\n');
} finally {
  if (initialVisitorsData !== null) {
    fs.writeFileSync(visitorsFile, initialVisitorsData, 'utf8');
  }
}
})();
