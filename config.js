/*
 * Kaduna Student Voice: shared lists.
 * Edit these lists to change the form, the dashboard and server validation at once.
 * Loaded by the browser (window.KSV) and by the Vercel API functions (require).
 */
(function (root, factory) {
  var cfg = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  else root.KSV = cfg;
})(typeof self !== 'undefined' ? self : this, function () {
  var OPT = function (v, l) { return { v: v, l: l || v }; };

  return {
    INSTITUTIONS: [
      'Ahmadu Bello University (ABU), Zaria',
      'Kaduna State University (KASU), Kaduna',
      'Nigerian Defence Academy (NDA), Kaduna',
      'Air Force Institute of Technology (AFIT), Kaduna',
      'Federal University of Applied Sciences, Kachia',
      'Kaduna Polytechnic, Kaduna',
      'Nuhu Bamalli Polytechnic, Zaria',
      'Nigerian College of Aviation Technology (NCAT), Zaria',
      'Federal College of Education, Zaria',
      'Kaduna State College of Education, Gidan Waya',
      'Shehu Idris College of Health Sciences and Technology, Makarfi',
      'Kaduna State College of Nursing and Midwifery, Kafanchan',
      'College of Agriculture and Animal Science, Mando'
    ],

    LEVELS: [
      'ND 1', 'ND 2', 'ND 3', 'NCE 1', 'NCE 2', 'NCE 3', 'HND 1', 'HND 2',
      '100 Level', '200 Level', '300 Level', '400 Level', '500 Level+',
      'Postgraduate', 'NYSC / Recent graduate'
    ],

    // Must match the LGA names in data/wards.json (from the INEC polling-unit list).
    LGAS: [
      'BIRNIN GWARI', 'CHIKUN', 'GIWA', 'IGABI', 'IKARA', 'JABA', "JEMA'A", 'KACHIA',
      'KADUNA NORTH', 'KADUNA SOUTH', 'KAGARKO', 'KAJURU', 'KAURA', 'KAURU', 'KUBAU',
      'KUDAN', 'LERE', 'MAKARFI', 'SABON GARI', 'SANGA', 'SOBA', 'ZANGON KATAF', 'ZARIA'
    ],
    OUTSIDE_LGA: 'Outside Kaduna State',

    SECTORS: [
      OPT('edu', 'Education'),
      OPT('welfare', 'Student welfare & bursary'),
      OPT('fees', 'School fees'),
      OPT('security', 'Security'),
      OPT('jobs', 'Youth jobs'),
      OPT('health', 'Health'),
      OPT('roads', 'Roads'),
      OPT('power', 'Water & power'),
      OPT('transport', 'Transport'),
      OPT('ict', 'ICT & digital'),
      OPT('agric', 'Agriculture & food prices'),
      OPT('sports', 'Sports & culture'),
      OPT('gov', 'Transparency & youth inclusion')
    ],

    GENDER: ['Female', 'Male', 'Prefer not to say'],
    AGE: ['Under 18', '18-21', '22-25', '26-30', 'Over 30'],
    PVC: [OPT('yes', 'Yes'), OPT('plan', 'No, but I plan to register'), OPT('no', 'No')],

    NELFUND: [
      OPT('tuition', 'Yes: tuition'),
      OPT('tuition_upkeep', 'Yes: tuition and upkeep'),
      OPT('waiting', 'Applied, still waiting'),
      OPT('rejected', 'Applied, not approved'),
      OPT('not_applied', 'Have not applied'),
      OPT('never_heard', 'Never heard of it')
    ],
    NELFUND_REASON: [
      OPT('not_eligible', 'I don\'t think I\'m eligible'),
      OPT('process', 'The process is too difficult'),
      OPT('documents', 'Missing documents (BVN, NIN, admission letter)'),
      OPT('school', 'My school is not on the portal'),
      OPT('distrust', 'I don\'t trust it / fear of debt'),
      OPT('no_need', 'I don\'t need it'),
      OPT('other', 'Other')
    ],
    NELFUND_WAIT: [
      OPT('lt1', 'Less than 1 month'),
      OPT('1to3', '1 to 3 months'),
      OPT('3to6', '3 to 6 months'),
      OPT('gt6', 'More than 6 months')
    ],
    SCHOLARSHIP: [OPT('yes', 'Yes'), OPT('applied', 'Applied, not received'), OPT('no', 'No')],
    YESNO: [OPT('yes', 'Yes'), OPT('no', 'No')],
    TRANSPORT: [OPT('yes', 'Yes'), OPT('no', 'No'), OPT('unaware', 'Not aware of it')],

    WANT_SHORT: [
      OPT('allowances', 'Targeted student allowances'),
      OPT('skills', 'Skills & ICT training'),
      OPT('job_ready', 'Job readiness programmes'),
      OPT('internships', 'Internships & placements'),
      OPT('remote', 'Remote / online learning support')
    ],
    WANT_LONG: [
      OPT('fees', 'Reduced school fees'),
      OPT('infra', 'More school infrastructure'),
      OPT('jobs', 'Jobs & employment'),
      OPT('startup', 'Startup funding & support'),
      OPT('business', 'Small business support')
    ],
    INCENTIVES: [
      OPT('internet', 'Student internet support'),
      OPT('transport', 'Transport support'),
      OPT('skills', 'Skills support'),
      OPT('job_ready', 'Job readiness'),
      OPT('internship', 'Internship'),
      OPT('nelfund_guide', 'NELFUND facilitation and application guide'),
      OPT('state_scholarship', 'State scholarship programme')
    ],
    MAX_PRIORITIES: 3,

    // Text length caps (characters).
    CAPS: { short: 80, mid: 160, long: 1500 }
  };
});
