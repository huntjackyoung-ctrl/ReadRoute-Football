const skillPositions = [
  { id: "X", x: 78, y: 482 },
  { id: "H", x: 255, y: 482 },
  { id: "Y", x: 645, y: 482 },
  { id: "Z", x: 822, y: 482 },
  { id: "RB", x: 520, y: 575 },
];

const offensiveLine = [
  { id: "LT", label: "LT", x: 370, y: 489 },
  { id: "LG", label: "LG", x: 410, y: 489 },
  { id: "C", label: "C", x: 450, y: 489 },
  { id: "RG", label: "RG", x: 490, y: 489 },
  { id: "RT", label: "RT", x: 530, y: 489 },
];

const quarterback = { id: "QB", label: "QB", x: 450, y: 540 };
const lineOfScrimmage = 476;
const scrimmageSnapDistance = 16;

const fieldStandards = {
  highSchool: {
    label: "High School",
    hashFromSidelineFeet: 160 / 3,
    numberCenterFromSidelineFeet: 24
  },
  college: {
    label: "College",
    hashFromSidelineFeet: 60,
    numberCenterFromSidelineFeet: 24
  },
  nfl: {
    label: "NFL",
    hashFromSidelineFeet: 70.75,
    numberCenterFromSidelineFeet: 39
  }
};

function defaultOffensePositions() {
  return [...skillPositions, ...offensiveLine, quarterback].reduce((positions, player) => {
    positions[player.id] = { x: player.x, y: player.y };
    return positions;
  }, {});
}

function defaultDefensePositions() {
  return [
    [330, 438], [410, 438], [490, 438], [570, 438],
    [300, 350], [450, 330], [600, 350],
    [100, 250], [335, 170], [565, 170], [800, 250]
  ].reduce((positions, [x, y], index) => {
    positions[`D${index}`] = { x, y };
    return positions;
  }, {});
}

function createNote(text = "", x = 350, y = 250) {
  return { id: crypto.randomUUID(), text, x, y, width: 170, height: 62 };
}

function createBlankPlay(name = "Untitled Play") {
  return {
    id: crypto.randomUUID(),
    name,
    labels: { X: "X", H: "H", Y: "Y", Z: "Z", RB: "RB" },
    routes: { X: [], H: [], Y: [], Z: [], RB: [] },
    routeOptions: { X: [], H: [], Y: [], Z: [], RB: [] },
    motions: { X: [], H: [], Y: [], Z: [], RB: [] },
    offensePositions: defaultOffensePositions(),
    formationId: null,
    notes: []
  };
}

function createBlankDefense(name = "Untitled Defense", labels = {}) {
  return {
    id: crypto.randomUUID(),
    name,
    positions: defaultDefensePositions(),
    routes: {},
    manAssignments: {},
    zoneAssignments: {},
    labels: structuredClone(labels),
    notes: []
  };
}

let plays = loadPlays();
let formations = loadFormations();
let defenses = loadDefenses();
let selectedPlayId = plays[0].id;
let draftPlay = null;
let selectedFormationId = plays[0].formationId || formations[0].id;
let selectedDefenseId = defenses[0].id;
let appTab = "create";
let createScreen = "formation";
let activeRouteId = "X";
let activeRouteSide = "offense";
let boardMode = "move";
let playPathType = "route";
let selectedRouteOptionId = "base";
let dragState = null;
let suppressFieldClickUntil = 0;
let animationFrame = null;
let animationState = null;
let runSpeed = 1;
let runDefenseMovement = true;
let runScenario = null;
let scenarioEditing = false;
let scenarioTool = "move";
let defenseAssignmentMode = "path";
let libraryPreview = { type: "play", id: selectedPlayId };
let saveToastTimer = null;
let fieldStandard = localStorage.getItem("readroute-field-standard") || "highSchool";
if (!fieldStandards[fieldStandard]) fieldStandard = "highSchool";

const els = {
  playName: document.querySelector("#playName"),
  playbookLibrary: document.querySelector("#playbookLibrary"),
  playEditorStatus: document.querySelector("#playEditorStatus"),
  formationSelect: document.querySelector("#formationSelect"),
  formationName: document.querySelector("#formationName"),
  playFormationSelect: document.querySelector("#playFormationSelect"),
  mirrorPlayFormationSelect: document.querySelector("#mirrorPlayFormationSelect"),
  runPlaySelect: document.querySelector("#runPlaySelect"),
  runFormationSelect: document.querySelector("#runFormationSelect"),
  runDefenseSelect: document.querySelector("#runDefenseSelect"),
  runSpeedSelect: document.querySelector("#runSpeedSelect"),
  runDefenseMovementSelect: document.querySelector("#runDefenseMovementSelect"),
  defenseSelect: document.querySelector("#defenseSelect"),
  defenseName: document.querySelector("#defenseName"),
  defenseLabels: document.querySelector("#defenseLabels"),
  assignments: document.querySelector("#assignments"),
  coachCue: document.querySelector("#coachCue"),
  boardTitle: document.querySelector("#boardTitle"),
  playCount: document.querySelector("#playCount"),
  routes: document.querySelector("#routes"),
  defenders: document.querySelector("#defenders"),
  players: document.querySelector("#players"),
  zones: document.querySelector("#zones"),
  markings: document.querySelector("#fieldMarkings"),
  activeRouteLabel: document.querySelector("#activeRouteLabel"),
  boardModeStatus: document.querySelector("#boardModeStatus"),
  routeHelp: document.querySelector("#routeHelp"),
  field: document.querySelector("#field"),
  fieldStandardSelect: document.querySelector("#fieldStandardSelect"),
  leftPanelEyebrow: document.querySelector("#leftPanelEyebrow"),
  leftPanelTitle: document.querySelector("#leftPanelTitle"),
  assignmentActionHeading: document.querySelector("#assignmentActionHeading"),
  fieldNote: document.querySelector("#fieldNote"),
  notes: document.querySelector("#notes"),
  saveToast: document.querySelector("#saveToast"),
  scenarioStatus: document.querySelector("#scenarioStatus"),
  defensePathHelp: document.querySelector("#defensePathHelp"),
  zoneSizeControl: document.querySelector("#zoneSizeControl"),
  zoneSizeRange: document.querySelector("#zoneSizeRange"),
  zoneSizeValue: document.querySelector("#zoneSizeValue"),
  routeOptionsEditor: document.querySelector("#routeOptionsEditor"),
  routeOptionPlayer: document.querySelector("#routeOptionPlayer"),
  routeOptionSelect: document.querySelector("#routeOptionSelect"),
  routeOptionDetails: document.querySelector("#routeOptionDetails"),
  routeOptionName: document.querySelector("#routeOptionName"),
  routeOptionDefense: document.querySelector("#routeOptionDefense"),
};

function loadPlays() {
  try {
    const saved = JSON.parse(localStorage.getItem("readroute-drawn-plays"));
    return Array.isArray(saved) && saved.length ? saved.map(normalizePlay) : [createBlankPlay()];
  } catch {
    return [createBlankPlay()];
  }
}

function normalizePlay(play) {
  const normalizePath = path => Array.isArray(path)
    ? path.map(point => ({
      x: Number(point.x),
      y: Number(point.y),
      rounded: Boolean(point.rounded),
      speed: [1, .75, .5, .25, .1].includes(Number(point.speed))
        ? Number(point.speed)
        : 1
      }))
    : [];
  return {
    ...play,
    labels: skillPositions.reduce((labels, position) => {
      labels[position.id] = play.labels?.[position.id] || position.id;
      return labels;
    }, {}),
    routes: skillPositions.reduce((routes, position) => {
      const savedRoute = play.routes?.[position.id];
      routes[position.id] = normalizePath(savedRoute);
      return routes;
    }, {}),
    routeOptions: skillPositions.reduce((options, position) => {
      const savedOptions = play.routeOptions?.[position.id];
      options[position.id] = Array.isArray(savedOptions)
        ? savedOptions.map((option, index) => ({
            id: option.id || crypto.randomUUID(),
            name: option.name || `Option ${index + 1}`,
            defenseIds: Array.isArray(option.defenseIds)
              ? [...new Set(option.defenseIds.filter(Boolean))]
              : (option.defenseId ? [option.defenseId] : []),
            anchor: option.anchor
              ? {
                  segmentIndex: Math.max(0, Number(option.anchor.segmentIndex) || 0),
                  t: Math.max(0, Math.min(1, Number(option.anchor.t) || 0))
                }
              : (Array.isArray(option.points) && option.points.length
                  ? { segmentIndex: 0, t: 0 }
                  : null),
            points: normalizePath(option.points)
          }))
        : [];
      return options;
    }, {}),
    motions: skillPositions.reduce((motions, position) => {
      const savedMotion = play.motions?.[position.id];
      motions[position.id] = normalizePath(savedMotion);
      return motions;
    }, {}),
    offensePositions: {
      ...defaultOffensePositions(),
      ...(play.offensePositions || {})
    },
    formationId: play.formationId || null,
    notes: Array.isArray(play.notes) ? play.notes : [],
    legacyDefensePositions: play.defensePositions || {},
    legacyDefenseRoutes: play.defenseRoutes || {},
    legacyCoverageId: play.coverageId || "cover1",
  };
}

function loadFormations() {
  try {
    const saved = JSON.parse(localStorage.getItem("readroute-formations"));
    if (Array.isArray(saved) && saved.length) {
      return saved.map(formation => ({
        ...formation,
        labels: formation.labels || { X: "X", H: "H", Y: "Y", Z: "Z", RB: "RB" },
        offensePositions: { ...defaultOffensePositions(), ...(formation.offensePositions || {}) },
        notes: Array.isArray(formation.notes) ? formation.notes : []
      }));
    }
  } catch {
    // Fall through to a formation based on the current play.
  }
  const source = plays[0];
  const formation = {
    id: crypto.randomUUID(),
    name: "Base Formation",
    labels: structuredClone(source.labels),
    offensePositions: structuredClone(source.offensePositions),
    notes: []
  };
  source.formationId = formation.id;
  return [formation];
}

function loadDefenses() {
  try {
    const saved = JSON.parse(localStorage.getItem("readroute-defenses"));
    if (Array.isArray(saved) && saved.length) return saved.map(defense => ({
      ...defense,
      positions: { ...defaultDefensePositions(), ...(defense.positions || {}) },
      routes: defense.routes || {},
      manAssignments: defense.manAssignments || {},
      zoneAssignments: defense.zoneAssignments || {},
      labels: defense.labels || {},
      notes: Array.isArray(defense.notes) ? defense.notes : []
    }));
  } catch {
    // Fall through to migrate the current play's defense.
  }
  const source = plays[0];
  return [{
    id: crypto.randomUUID(),
    name: "Base Defense",
    positions: {
      ...defaultDefensePositions(),
      ...structuredClone(source.legacyDefensePositions?.[source.legacyCoverageId] || {})
    },
    routes: structuredClone(source.legacyDefenseRoutes?.[source.legacyCoverageId] || {}),
    manAssignments: {},
    zoneAssignments: {},
    labels: {},
    notes: []
  }];
}

function savePlays() {
  localStorage.setItem("readroute-drawn-plays", JSON.stringify(plays));
  els.playCount.textContent = plays.length;
}

function saveFormations() {
  localStorage.setItem("readroute-formations", JSON.stringify(formations));
}

function saveDefenses() {
  localStorage.setItem("readroute-defenses", JSON.stringify(defenses));
}

function currentPlay() {
  if (draftPlay) return draftPlay;
  return plays.find(play => play.id === selectedPlayId) || plays[0];
}

function currentFormation() {
  return formations.find(formation => formation.id === selectedFormationId) || formations[0];
}

function currentDefense() {
  return defenses.find(defense => defense.id === selectedDefenseId) || defenses[0];
}

function createRunScenario() {
  return {
    offensePositions: structuredClone(currentFormation().offensePositions),
    offenseRoutes: skillPositions.reduce((routes, position) => {
      routes[position.id] = structuredClone(
        resolvedRouteForDefense(currentPlay(), position.id, selectedDefenseId)
      );
      return routes;
    }, {}),
    offenseMotions: structuredClone(currentPlay().motions),
    defensePositions: structuredClone(currentDefense().positions),
    defenseRoutes: structuredClone(currentDefense().routes),
    manAssignments: structuredClone(currentDefense().manAssignments || {}),
    zoneAssignments: structuredClone(currentDefense().zoneAssignments || {})
  };
}

function resetRunScenario() {
  runScenario = createRunScenario();
  animationState = null;
  activeRouteSide = "offense";
  activeRouteId = "X";
}

function runScenarioRoute(side, id) {
  if (!runScenario) resetRunScenario();
  return side === "offense"
    ? (runScenario.offenseRoutes[id] ||= [])
    : (runScenario.defenseRoutes[id] ||= []);
}

function currentManAssignments() {
  if (appTab === "run") {
    if (!runScenario) resetRunScenario();
    return runScenario.manAssignments;
  }
  currentDefense().manAssignments ||= {};
  return currentDefense().manAssignments;
}

function currentZoneAssignments() {
  if (appTab === "run") {
    if (!runScenario) resetRunScenario();
    return runScenario.zoneAssignments ||= {};
  }
  currentDefense().zoneAssignments ||= {};
  return currentDefense().zoneAssignments;
}

function assignMan(defenderId, offenseId) {
  const assignments = currentManAssignments();
  assignments[defenderId] = offenseId;
  delete currentZoneAssignments()[defenderId];
  if (appTab === "run") {
    runScenario.defenseRoutes[defenderId] = [];
  } else {
    currentDefense().routes[defenderId] = [];
  }
}

function clearDefenderAssignment(defenderId) {
  delete currentManAssignments()[defenderId];
  delete currentZoneAssignments()[defenderId];
  if (appTab === "run") {
    runScenario.defenseRoutes[defenderId] = [];
  } else {
    currentDefense().routes[defenderId] = [];
  }
}

function currentMotion(id) {
  if (appTab === "run") {
    if (!runScenario) resetRunScenario();
    return runScenario.offenseMotions[id] ||= [];
  }
  return currentPlay().motions[id] ||= [];
}

function routeOptionsFor(play, id) {
  play.routeOptions ||= {};
  return play.routeOptions[id] ||= [];
}

function selectedRouteOption(id = activeRouteId) {
  if (selectedRouteOptionId === "base") return null;
  return routeOptionsFor(currentPlay(), id)
    .find(option => option.id === selectedRouteOptionId) || null;
}

function editablePlayRoute(id) {
  if (createScreen === "play" && id === activeRouteId) {
    return selectedRouteOption(id)?.points || currentPlay().routes[id];
  }
  return currentPlay().routes[id] || [];
}

function routeAnchorPoint(start, route, anchor) {
  if (!anchor) return null;
  const path = [start, ...route];
  const segmentIndex = Math.min(anchor.segmentIndex, Math.max(0, path.length - 2));
  const from = path[segmentIndex];
  const to = path[segmentIndex + 1] || from;
  return {
    x: from.x + ((to.x - from.x) * anchor.t),
    y: from.y + ((to.y - from.y) * anchor.t)
  };
}

function branchedRoute(play, id, option, start = play.offensePositions[id]) {
  const baseRoute = play.routes[id] || [];
  if (!option?.anchor || !option.points.length) return baseRoute;
  const segmentIndex = Math.min(
    option.anchor.segmentIndex,
    Math.max(0, baseRoute.length - 1)
  );
  const anchorPoint = routeAnchorPoint(start, baseRoute, option.anchor);
  const prefix = baseRoute.slice(0, segmentIndex);
  return [
    ...prefix,
    {
      ...anchorPoint,
      rounded: false,
      speed: baseRoute[segmentIndex]?.speed || 1
    },
    ...option.points
  ];
}

function routeBranchParts(play, id, option, start = play.offensePositions[id]) {
  const baseRoute = play.routes[id] || [];
  if (!option?.anchor) {
    return { stem: baseRoute, anchor: null, branch: [] };
  }
  const segmentIndex = Math.min(
    option.anchor.segmentIndex,
    Math.max(0, baseRoute.length - 1)
  );
  const anchor = routeAnchorPoint(start, baseRoute, option.anchor);
  return {
    stem: [
      ...baseRoute.slice(0, segmentIndex),
      {
        ...anchor,
        rounded: false,
        speed: baseRoute[segmentIndex]?.speed || 1
      }
    ],
    anchor,
    branch: option.points || []
  };
}

function resolvedRouteForDefense(play, id, defenseId) {
  const matchingOption = routeOptionsFor(play, id)
    .find(option => option.defenseIds?.includes(defenseId));
  return matchingOption
    ? branchedRoute(play, id, matchingOption)
    : play.routes[id] || [];
}

function matchedRouteOption(play, id, defenseId) {
  return routeOptionsFor(play, id)
    .find(option => option.defenseIds?.includes(defenseId)) || null;
}

function emptyPlayPaths(play) {
  play.routeOptions ||= {};
  skillPositions.forEach(position => {
    play.routes[position.id] = [];
    play.routeOptions[position.id] = [];
    play.motions[position.id] = [];
  });
}

function currentNoteOwner() {
  if (createScreen === "formation") return currentFormation();
  if (createScreen === "defense") return currentDefense();
  return currentPlay();
}

function visibleNotes() {
  if (appTab === "run") return [];
  return currentNoteOwner().notes || [];
}

function showSaveSuccess(message = "Saved successfully") {
  clearTimeout(saveToastTimer);
  els.saveToast.textContent = message;
  els.saveToast.classList.add("visible");
  saveToastTimer = setTimeout(() => els.saveToast.classList.remove("visible"), 1800);
}

function offenseLabel(id) {
  const labels = appTab === "run" || createScreen === "formation" || createScreen === "defense"
    ? currentFormation().labels
    : currentPlay().labels;
  return labels[id] || id;
}

function activeRouteDisplayLabel() {
  const label = activeRouteSide === "offense"
    ? offenseLabel(activeRouteId)
    : activeRouteId;
  const option = appTab === "create" && createScreen === "play"
    ? selectedRouteOption(activeRouteId)
    : null;
  return option ? `${label}: ${option.name}` : label;
}

function editorOffensePositions() {
  if (appTab === "run") {
    if (!runScenario) resetRunScenario();
    return runScenario.offensePositions;
  }
  if (createScreen === "formation" || createScreen === "defense") {
    return currentFormation().offensePositions;
  }
  return currentPlay().offensePositions;
}

function isSkillPosition(id) {
  return skillPositions.some(position => position.id === id);
}

function snapPlayerToScrimmage(point, event) {
  const shouldSnap = !event.altKey
    && Math.abs(point.y - lineOfScrimmage) <= scrimmageSnapDistance;
  els.field.classList.toggle("scrimmage-snapping", shouldSnap);
  return shouldSnap ? { ...point, y: lineOfScrimmage } : point;
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderMarkings() {
  els.markings.innerHTML = "";
  const pixelsPerYard = 900 / (160 / 3);
  const pixelsPerFoot = 900 / 160;
  const standard = fieldStandards[fieldStandard];
  const hashLeft = standard.hashFromSidelineFeet * pixelsPerFoot;
  const hashRight = 900 - hashLeft;
  const numberLeft = standard.numberCenterFromSidelineFeet * pixelsPerFoot;
  const numberRight = 900 - numberLeft;

  els.markings.append(svgEl("line", { x1: 2, y1: 0, x2: 2, y2: 620, stroke: "rgba(255,255,255,.8)", "stroke-width": 4 }));
  els.markings.append(svgEl("line", { x1: 898, y1: 0, x2: 898, y2: 620, stroke: "rgba(255,255,255,.8)", "stroke-width": 4 }));

  for (let yard = -8; yard <= 32; yard += 1) {
    const y = lineOfScrimmage - (yard * pixelsPerYard);
    if (y < 0 || y > 620) continue;
    const isFive = yard % 5 === 0;
    els.markings.append(svgEl("line", {
      x1: isFive ? 0 : 9,
      y1: y,
      x2: isFive ? 900 : 891,
      y2: y,
      stroke: `rgba(255,255,255,${isFive ? ".30" : ".11"})`,
      "stroke-width": isFive ? 2 : 1
    }));
    [hashLeft, hashRight].forEach(hashX => {
      els.markings.append(svgEl("line", {
        x1: hashX - (pixelsPerYard / 3),
        y1: y,
        x2: hashX + (pixelsPerYard / 3),
        y2: y,
        stroke: "rgba(255,255,255,.68)",
        "stroke-width": 2
      }));
    });
    els.markings.append(svgEl("line", { x1: 0, y1: y, x2: 11, y2: y, stroke: "rgba(255,255,255,.65)", "stroke-width": 2 }));
    els.markings.append(svgEl("line", { x1: 889, y1: y, x2: 900, y2: y, stroke: "rgba(255,255,255,.65)", "stroke-width": 2 }));
  }

  [
    { yard: 0, value: "30" },
    { yard: 10, value: "40" },
    { yard: 20, value: "50" },
  ].forEach(mark => {
    const y = lineOfScrimmage - (mark.yard * pixelsPerYard);
    [numberLeft, numberRight].forEach((x, index) => {
      const number = svgEl("text", {
        x,
        y,
        fill: "rgba(255,255,255,.70)",
        "font-family": "Arial, sans-serif",
        "font-size": 34,
        "font-weight": 900,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        transform: index === 0 ? `rotate(90 ${x} ${y})` : `rotate(-90 ${x} ${y})`
      });
      number.textContent = mark.value;
      els.markings.append(number);
    });
  });

  els.markings.append(svgEl("line", {
    id: "scrimmageLine",
    x1: 0,
    y1: lineOfScrimmage,
    x2: 900,
    y2: lineOfScrimmage,
    stroke: "#fff",
    "stroke-width": 4
  }));
  const label = svgEl("text", { x: 18, y: lineOfScrimmage - 10, fill: "rgba(255,255,255,.76)", "font-size": 10, "font-weight": 800 });
  label.textContent = "LINE OF SCRIMMAGE";
  els.markings.append(label);
}

function renderPlayControls() {
  els.playName.value = currentPlay().name;
  els.playEditorStatus.textContent = draftPlay ? "New unsaved play" : `Editing ${currentPlay().name}`;
  els.playFormationSelect.innerHTML = formations.map(formation =>
    `<option value="${formation.id}">${escapeHtml(formation.name)}</option>`
  ).join("");
  els.playFormationSelect.value = currentPlay().formationId || selectedFormationId;
  els.playFormationSelect.disabled = !draftPlay;
  const sourceFormationId = currentPlay().formationId || selectedFormationId;
  const mirrorTargets = formations.filter(formation => formation.id !== sourceFormationId);
  els.mirrorPlayFormationSelect.innerHTML = mirrorTargets.length
    ? mirrorTargets.map(formation =>
        `<option value="${formation.id}">${escapeHtml(formation.name)}</option>`
      ).join("")
    : `<option value="">Create another formation first</option>`;
  els.mirrorPlayFormationSelect.disabled = !mirrorTargets.length;
  document.querySelector("#mirrorPlayButton").disabled = !mirrorTargets.length;
  els.assignmentActionHeading.textContent = createScreen === "formation" ? "Select" : "Route";
  els.assignments.innerHTML = skillPositions.map(position => `
    <div class="assignment-row">
      <input data-label="${position.id}" value="${escapeHtml(offenseLabel(position.id))}" maxlength="4" aria-label="${position.id} display label">
      <button class="route-select-button ${activeRouteSide === "offense" && position.id === activeRouteId ? "active" : ""}" data-position="${position.id}">
        ${createScreen === "formation"
          ? "Select"
          : `R ${currentPlay().routes[position.id].length} / O ${routeOptionsFor(currentPlay(), position.id).length} / M ${currentPlay().motions[position.id].length}`}
      </button>
    </div>
  `).join("");
  els.assignments.querySelectorAll(".route-select-button").forEach(button => {
    button.addEventListener("click", event => {
      activeRouteSide = "offense";
      activeRouteId = event.currentTarget.dataset.position;
      selectedRouteOptionId = "base";
      if (createScreen === "formation") boardMode = "move";
      renderPlayControls();
      renderRoutesAndPlayers();
    });
  });
  els.assignments.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", event => {
      const target = createScreen === "formation" ? currentFormation().labels : currentPlay().labels;
      target[event.target.dataset.label] = event.target.value.trim().toUpperCase() || event.target.dataset.label;
      render();
    });
  });
  els.playCount.textContent = plays.length;
  els.activeRouteLabel.textContent = activeRouteDisplayLabel();
  renderRouteOptionControls();
  renderFormationControls();
  renderDefenseControls();
  renderRunControls();
}

function renderRouteOptionControls() {
  const available = createScreen === "play" && activeRouteSide === "offense"
    && isSkillPosition(activeRouteId);
  els.routeOptionsEditor.classList.toggle("unavailable", !available);
  if (!available) return;

  const options = routeOptionsFor(currentPlay(), activeRouteId);
  if (selectedRouteOptionId !== "base"
    && !options.some(option => option.id === selectedRouteOptionId)) {
    selectedRouteOptionId = "base";
  }
  const selected = selectedRouteOption(activeRouteId);
  els.routeOptionPlayer.textContent = `${offenseLabel(activeRouteId)} options`;
  els.routeOptionSelect.innerHTML = [
    `<option value="base">Base Route</option>`,
    ...options.map(option =>
      `<option value="${option.id}">${escapeHtml(option.name)}</option>`
    )
  ].join("");
  els.routeOptionSelect.value = selectedRouteOptionId;
  els.routeOptionDetails.classList.toggle("hidden", !selected);
  if (selected) {
    els.routeOptionName.value = selected.name;
    els.routeOptionDefense.innerHTML = defenses.map(defense =>
      `<label class="route-defense-choice">
        <input type="checkbox" value="${defense.id}" ${selected.defenseIds.includes(defense.id) ? "checked" : ""}>
        <span>${escapeHtml(defense.name)}</span>
      </label>`
    ).join("");
  }
}

function renderPlaybookLibrary() {
  const formationFolders = formations.map(formation => {
    const formationPlays = plays.filter(play => play.formationId === formation.id);
    return `
      <details class="library-folder" open>
        <summary>
          <span class="library-folder-icon">F</span>
          <span>${escapeHtml(formation.name)}</span>
          <small>${formationPlays.length} ${formationPlays.length === 1 ? "play" : "plays"}</small>
        </summary>
        <div class="library-folder-content">
          <div class="library-folder-actions">
            <button class="library-action-button" data-edit-formation="${formation.id}">Edit Formation</button>
            <button class="library-action-button danger" data-delete-formation="${formation.id}" ${formations.length === 1 || formationPlays.length ? "disabled" : ""} title="${formationPlays.length ? "Delete this formation's plays first" : "Delete formation"}">Delete</button>
          </div>
          ${formationPlays.length
            ? formationPlays.map(play => `
              <div class="library-file-row">
                <button class="library-file" data-library-play="${play.id}">
                  <span class="library-file-icon">P</span>
                  <span>${escapeHtml(play.name)}</span>
                </button>
                <button class="library-action-button" data-edit-play="${play.id}">Edit</button>
                <button class="library-action-button danger" data-delete-play="${play.id}" ${plays.length === 1 ? "disabled" : ""}>Delete</button>
              </div>
            `).join("")
            : `<p class="library-empty">No plays saved for this formation.</p>`}
        </div>
      </details>
    `;
  }).join("");

  const defenseFiles = defenses.map(defense => `
    <div class="library-file-row">
      <button class="library-file defense-file" data-library-defense="${defense.id}">
        <span class="library-file-icon">D</span>
        <span>${escapeHtml(defense.name)}</span>
      </button>
      <button class="library-action-button" data-edit-defense="${defense.id}">Edit</button>
      <button class="library-action-button danger" data-delete-defense="${defense.id}" ${defenses.length === 1 ? "disabled" : ""}>Delete</button>
    </div>
  `).join("");

  els.playbookLibrary.innerHTML = `
    <div class="library-heading">
      <div>
        <p class="eyebrow">Saved files</p>
        <h2>Your Playbook</h2>
        <p>Open any saved play or defense to review and edit it.</p>
      </div>
      <div class="library-heading-actions">
        <div class="library-counts">
          <span><strong>${formations.length}</strong> Formations</span>
          <span><strong>${plays.length}</strong> Plays</span>
          <span><strong>${defenses.length}</strong> Defenses</span>
        </div>
        <div class="library-transfer-actions">
          <button id="exportPlaybookButton" class="library-action-button">Export Playbook</button>
          <label class="library-action-button import-playbook-button">
            Import Playbook
            <input id="importPlaybookInput" type="file" accept=".json,application/json">
          </label>
        </div>
      </div>
    </div>
    <div class="library-browser">
      <div class="library-files">
        <div class="library-column">
          <p class="eyebrow">Offense</p>
          ${formationFolders}
        </div>
        <div class="library-column">
          <p class="eyebrow">Defense</p>
          <details class="library-folder defense-folder" open>
            <summary>
              <span class="library-folder-icon">D</span>
              <span>Defenses</span>
              <small>${defenses.length}</small>
            </summary>
            <div class="library-folder-content">${defenseFiles}</div>
          </details>
        </div>
      </div>
      <div class="library-preview">${libraryPreviewMarkup()}</div>
    </div>
  `;

  els.playbookLibrary.querySelectorAll("[data-library-play]").forEach(button => {
    button.addEventListener("click", () => {
      libraryPreview = { type: "play", id: button.dataset.libraryPlay };
      renderPlaybookLibrary();
    });
  });

  els.playbookLibrary.querySelectorAll("[data-library-defense]").forEach(button => {
    button.addEventListener("click", () => {
      libraryPreview = { type: "defense", id: button.dataset.libraryDefense };
      renderPlaybookLibrary();
    });
  });

  els.playbookLibrary.querySelectorAll("[data-edit-play]").forEach(button => {
    button.addEventListener("click", () => openPlayEditor(button.dataset.editPlay));
  });

  els.playbookLibrary.querySelectorAll("[data-edit-formation]").forEach(button => {
    button.addEventListener("click", () => openFormationEditor(button.dataset.editFormation));
  });

  els.playbookLibrary.querySelectorAll("[data-edit-defense]").forEach(button => {
    button.addEventListener("click", () => openDefenseEditor(button.dataset.editDefense));
  });

  els.playbookLibrary.querySelectorAll("[data-delete-play]").forEach(button => {
    button.addEventListener("click", () => deleteSavedPlay(button.dataset.deletePlay));
  });

  els.playbookLibrary.querySelectorAll("[data-delete-formation]").forEach(button => {
    button.addEventListener("click", () => deleteSavedFormation(button.dataset.deleteFormation));
  });

  els.playbookLibrary.querySelectorAll("[data-delete-defense]").forEach(button => {
    button.addEventListener("click", () => deleteSavedDefense(button.dataset.deleteDefense));
  });

  els.playbookLibrary.querySelector("#exportPlaybookButton")
    ?.addEventListener("click", exportPlaybook);
  els.playbookLibrary.querySelector("#importPlaybookInput")
    ?.addEventListener("change", importPlaybook);
}

function exportPlaybook() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    fieldStandard,
    formations,
    plays,
    defenses
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `ReadRoute-Playbook-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showSaveSuccess("Playbook exported");
}

async function importPlaybook(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.formations) || !data.formations.length
      || !Array.isArray(data.plays) || !data.plays.length
      || !Array.isArray(data.defenses) || !data.defenses.length) {
      throw new Error("This file does not contain a complete ReadRoute playbook.");
    }
    if (!window.confirm("Import this playbook? This will replace the playbook saved in this browser.")) return;
    formations = data.formations.map(formation => ({
      ...formation,
      labels: formation.labels || { X: "X", H: "H", Y: "Y", Z: "Z", RB: "RB" },
      offensePositions: { ...defaultOffensePositions(), ...(formation.offensePositions || {}) },
      notes: Array.isArray(formation.notes) ? formation.notes : []
    }));
    plays = data.plays.map(normalizePlay);
    defenses = data.defenses.map(defense => ({
      ...defense,
      positions: { ...defaultDefensePositions(), ...(defense.positions || {}) },
      routes: defense.routes || {},
      manAssignments: defense.manAssignments || {},
      zoneAssignments: defense.zoneAssignments || {},
      labels: defense.labels || {},
      notes: Array.isArray(defense.notes) ? defense.notes : []
    }));
    selectedPlayId = plays[0].id;
    selectedFormationId = plays[0].formationId || formations[0].id;
    selectedDefenseId = defenses[0].id;
    libraryPreview = { type: "play", id: selectedPlayId };
    if (fieldStandards[data.fieldStandard]) {
      fieldStandard = data.fieldStandard;
      localStorage.setItem("readroute-field-standard", fieldStandard);
    }
    saveAllLibraries();
    renderMarkings();
    renderPlayControls();
    render();
    showSaveSuccess("Playbook imported");
  } catch (error) {
    window.alert(error.message || "That playbook file could not be imported.");
  }
}

function openPlayEditor(playId) {
  selectedPlayId = playId;
  selectedFormationId = currentPlay().formationId || formations[0].id;
  draftPlay = null;
  appTab = "create";
  createScreen = "play";
  activeRouteSide = "offense";
  activeRouteId = "X";
  boardMode = "draw";
  playPathType = "route";
  selectedRouteOptionId = "base";
  syncTabButtons();
  renderPlayControls();
  render();
}

function openFormationEditor(formationId) {
  selectedFormationId = formationId;
  draftPlay = null;
  appTab = "create";
  createScreen = "formation";
  activeRouteSide = "offense";
  activeRouteId = "X";
  boardMode = "move";
  syncTabButtons();
  renderPlayControls();
  render();
}

function openDefenseEditor(defenseId) {
  selectedDefenseId = defenseId;
  draftPlay = null;
  appTab = "create";
  createScreen = "defense";
  activeRouteSide = "defense";
  activeRouteId = "D0";
  boardMode = "move";
  defenseAssignmentMode = "path";
  syncTabButtons();
  renderPlayControls();
  render();
}

function deleteSavedPlay(playId) {
  if (plays.length === 1) return;
  const play = plays.find(item => item.id === playId);
  if (!play || !window.confirm(`Delete "${play.name}"?`)) return;
  plays = plays.filter(item => item.id !== playId);
  if (selectedPlayId === playId) selectedPlayId = plays[0].id;
  if (libraryPreview.type === "play" && libraryPreview.id === playId) {
    libraryPreview = { type: "play", id: plays[0].id };
  }
  selectedFormationId = currentPlay().formationId || formations[0].id;
  savePlays();
  renderPlayControls();
  render();
}

function deleteSavedFormation(formationId) {
  const formation = formations.find(item => item.id === formationId);
  if (!formation || formations.length === 1) return;
  if (plays.some(play => play.formationId === formationId)) {
    window.alert("Delete the plays inside this formation first.");
    return;
  }
  if (!window.confirm(`Delete formation "${formation.name}"?`)) return;
  formations = formations.filter(item => item.id !== formationId);
  if (selectedFormationId === formationId) selectedFormationId = formations[0].id;
  saveFormations();
  renderPlayControls();
  render();
}

function deleteSavedDefense(defenseId) {
  if (defenses.length === 1) return;
  const defense = defenses.find(item => item.id === defenseId);
  if (!defense || !window.confirm(`Delete "${defense.name}"?`)) return;
  defenses = defenses.filter(item => item.id !== defenseId);
  [...plays, ...(draftPlay ? [draftPlay] : [])].forEach(play => {
    skillPositions.forEach(position => {
      routeOptionsFor(play, position.id).forEach(option => {
        option.defenseIds = option.defenseIds.filter(id => id !== defenseId);
      });
    });
  });
  if (selectedDefenseId === defenseId) selectedDefenseId = defenses[0].id;
  if (libraryPreview.type === "defense" && libraryPreview.id === defenseId) {
    libraryPreview = { type: "defense", id: defenses[0].id };
  }
  saveDefenses();
  savePlays();
  renderPlayControls();
  render();
}

function libraryPreviewMarkup() {
  const isDefense = libraryPreview.type === "defense";
  const item = isDefense
    ? defenses.find(defense => defense.id === libraryPreview.id) || defenses[0]
    : plays.find(play => play.id === libraryPreview.id) || plays[0];
  const formation = isDefense
    ? currentFormation()
    : formations.find(savedFormation => savedFormation.id === item.formationId) || formations[0];
  const offensePositions = formation.offensePositions;
  const offenseLabels = formation.labels;
  const routeMarkup = isDefense ? "" : skillPositions.map(position => {
    const route = item.routes[position.id] || [];
    const motion = item.motions?.[position.id] || [];
    const start = offensePositions[position.id];
    const snapStart = motionEnd(start, motion);
    const dx = snapStart.x - start.x;
    const dy = snapStart.y - start.y;
    const shiftedRoute = motion.length
      ? route.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }))
      : route;
    const motionPath = motion.length
      ? `<path d="${motion.length === 1 ? `M ${start.x} ${start.y} L ${motion[0].x} ${motion[0].y}` : routePathData(start, motion)}" fill="none" stroke="#76d7ff" stroke-width="4" stroke-dasharray="7 6" marker-end="url(#libraryMotionArrow)"></path>`
      : "";
    const routePath = shiftedRoute.length
      ? `<path d="${shiftedRoute.length === 1 ? `M ${snapStart.x} ${snapStart.y} L ${shiftedRoute[0].x} ${shiftedRoute[0].y}` : routePathData(snapStart, shiftedRoute)}" fill="none" stroke="#f2c35a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#libraryArrow)"></path>`
      : "";
    return motionPath + routePath;
  }).join("");
  const optionRouteMarkup = isDefense ? "" : skillPositions.map(position => {
    const start = offensePositions[position.id];
    const motion = item.motions?.[position.id] || [];
    const snapStart = motionEnd(start, motion);
    const dx = snapStart.x - start.x;
    const dy = snapStart.y - start.y;
    return routeOptionsFor(item, position.id).map(option => {
      const storedAnchor = routeAnchorPoint(
        start,
        item.routes[position.id] || [],
        option.anchor
      );
      if (!storedAnchor || !option.points.length) return "";
      const displayAnchor = {
        x: storedAnchor.x + dx,
        y: storedAnchor.y + dy
      };
      const shifted = motion.length
        ? option.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }))
        : option.points;
      const pathData = shifted.length === 1
        ? `M ${displayAnchor.x} ${displayAnchor.y} L ${shifted[0].x} ${shifted[0].y}`
        : routePathData(displayAnchor, shifted);
      return `<path d="${pathData}" fill="none" stroke="#c9f45c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 6" marker-end="url(#libraryOptionArrow)" opacity=".82"></path>`;
    }).join("");
  }).join("");
  const offenseMarkup = [
    ...skillPositions.map(position => {
      const point = offensePositions[position.id];
      return `<g transform="translate(${point.x} ${point.y})"><circle r="18" fill="#f2c35a" stroke="#fff5d7" stroke-width="3"></circle><text y="4" text-anchor="middle" fill="#10231c" font-size="10" font-weight="900">${escapeHtml(offenseLabels[position.id] || position.id)}</text></g>`;
    }),
    ...offensiveLine.map(player => {
      const point = offensePositions[player.id];
      return `<g transform="translate(${point.x} ${point.y})"><rect x="-15" y="-15" width="30" height="30" rx="5" fill="#f2c35a" stroke="#fff5d7" stroke-width="3"></rect><text y="4" text-anchor="middle" fill="#10231c" font-size="9" font-weight="900">${player.label}</text></g>`;
    }),
    (() => {
      const point = offensePositions.QB;
      return `<g transform="translate(${point.x} ${point.y})"><circle r="19" fill="#f2c35a" stroke="#fff5d7" stroke-width="3"></circle><text y="4" text-anchor="middle" fill="#10231c" font-size="10" font-weight="900">QB</text></g>`;
    })()
  ].join("");
  const defenseMarkup = isDefense ? Object.keys(defaultDefensePositions()).map((id, index) => {
    const start = item.positions[id] || defaultDefensePositions()[id];
    const route = item.routes[id] || [];
    const manTarget = item.manAssignments?.[id];
    const zoneAssignment = item.zoneAssignments?.[id];
    const manLine = manTarget && offensePositions[manTarget]
      ? `<line x1="${start.x}" y1="${start.y}" x2="${offensePositions[manTarget].x}" y2="${offensePositions[manTarget].y}" stroke="#c9f45c" stroke-width="2" stroke-dasharray="5 5" opacity=".7"></line>`
      : "";
    const zoneMarkup = zoneAssignment
      ? `<circle cx="${zoneAssignment.x}" cy="${zoneAssignment.y}" r="${zoneAssignment.radius || 125}" fill="rgba(118,215,255,.08)" stroke="#76d7ff" stroke-width="2" stroke-dasharray="8 7" opacity=".55"></circle>`
      : "";
    const path = route.length
      ? `<path d="${route.length === 1 ? `M ${start.x} ${start.y} L ${route[0].x} ${route[0].y}` : routePathData(start, route)}" fill="none" stroke="#ed7048" stroke-width="4" stroke-dasharray="10 6" marker-end="url(#libraryDefenseArrow)"></path>`
      : "";
    return `${zoneMarkup}${manLine}${path}<g transform="translate(${start.x} ${start.y})"><circle r="15" fill="#ed7048" stroke="#ffd8ca" stroke-width="2"></circle><text y="4" text-anchor="middle" fill="#30140c" font-size="8" font-weight="900">${escapeHtml(item.labels[id] || String(index + 1))}</text></g>`;
  }).join("") : "";
  const notes = isDefense
    ? (item.notes || [])
    : [...(formation.notes || []), ...(item.notes || [])];
  const notesMarkup = notes.map(note => {
    const dimensions = noteDimensions(note.text);
    return `<g transform="translate(${note.x} ${note.y})"><rect width="${dimensions.width}" height="${dimensions.height}" rx="5" fill="rgba(255,253,247,.94)" stroke="#c9f45c" stroke-width="2"></rect><text x="10" y="24" fill="#10231c" font-size="12" font-weight="800">${escapeHtml(note.text || "")}</text></g>`;
  }).join("");
  const routeOptionSummary = isDefense ? "" : skillPositions.flatMap(position =>
    routeOptionsFor(item, position.id).map(option => {
      const defenseNames = option.defenseIds
        .map(defenseId => defenses.find(candidate => candidate.id === defenseId)?.name)
        .filter(Boolean);
      return `<span><strong>${escapeHtml(offenseLabels[position.id] || position.id)}:</strong> ${escapeHtml(option.name)} vs. ${escapeHtml(defenseNames.join(", ") || "Unassigned defense")}</span>`;
    })
  ).join("");

  return `
    <div class="library-preview-heading">
      <p class="eyebrow">${isDefense ? "Defense preview" : escapeHtml(formation.name)}</p>
      <h3>${escapeHtml(item.name)}</h3>
    </div>
    <svg viewBox="0 0 900 620" aria-label="${escapeHtml(item.name)} preview">
      <defs>
        <marker id="libraryArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L7,3 z" fill="#f2c35a"></path></marker>
        <marker id="libraryMotionArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L7,3 z" fill="#76d7ff"></path></marker>
        <marker id="libraryDefenseArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L7,3 z" fill="#ed7048"></path></marker>
        <marker id="libraryOptionArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L0,6 L7,3 z" fill="#c9f45c"></path></marker>
      </defs>
      <rect width="900" height="620" rx="10" fill="#174c35"></rect>
      <line x1="0" y1="476" x2="900" y2="476" stroke="#fff" stroke-width="4"></line>
      ${routeMarkup}${optionRouteMarkup}${offenseMarkup}${defenseMarkup}${notesMarkup}
    </svg>
    ${routeOptionSummary
      ? `<div class="route-option-summary"><p class="eyebrow">Route options</p>${routeOptionSummary}</div>`
      : ""}
  `;
}

function activeRunRouteOptions() {
  if (appTab !== "run") return [];
  return skillPositions.map(position => {
    const option = matchedRouteOption(currentPlay(), position.id, selectedDefenseId);
    return option
      ? { player: offenseLabel(position.id), option }
      : null;
  }).filter(Boolean);
}

function renderFormationControls() {
  els.formationSelect.innerHTML = formations.map(formation =>
    `<option value="${formation.id}">${escapeHtml(formation.name)}</option>`
  ).join("");
  els.formationSelect.value = selectedFormationId;
  els.formationName.value = currentFormation()?.name || "";
}

function renderDefenseControls() {
  els.defenseSelect.innerHTML = defenses.map(defense =>
    `<option value="${defense.id}">${escapeHtml(defense.name)}</option>`
  ).join("");
  els.defenseSelect.value = selectedDefenseId;
  els.defenseName.value = currentDefense().name;
  const selectedZone = activeRouteSide === "defense"
    ? currentDefense().zoneAssignments?.[activeRouteId]
    : null;
  els.zoneSizeControl.classList.toggle(
    "hidden",
    createScreen !== "defense" || defenseAssignmentMode !== "zone" || !selectedZone
  );
  if (selectedZone) {
    els.zoneSizeRange.value = String(selectedZone.radius || 125);
    els.zoneSizeValue.textContent = String(selectedZone.radius || 125);
  }
}

function renderRunControls() {
  const runnableFormations = formations.filter(formation =>
    plays.some(play => play.formationId === formation.id)
  );
  const selectedPlay = plays.find(play => play.id === selectedPlayId);
  if (appTab === "run") {
    if (selectedPlay?.formationId && runnableFormations.some(formation => formation.id === selectedPlay.formationId)) {
      selectedFormationId = selectedPlay.formationId;
    } else if (!runnableFormations.some(formation => formation.id === selectedFormationId)) {
      selectedFormationId = runnableFormations[0]?.id || formations[0].id;
    }
  }

  const formationPlays = plays.filter(play => play.formationId === selectedFormationId);
  if (appTab === "run" && !formationPlays.some(play => play.id === selectedPlayId)) {
    selectedPlayId = formationPlays[0]?.id || plays[0].id;
  }
  els.runPlaySelect.innerHTML = formationPlays.map(play =>
    `<option value="${play.id}">${escapeHtml(play.name)}</option>`
  ).join("");
  els.runPlaySelect.value = selectedPlayId;
  els.runPlaySelect.disabled = formationPlays.length === 0;
  els.runFormationSelect.innerHTML = runnableFormations.map(formation =>
    `<option value="${formation.id}">${escapeHtml(formation.name)}</option>`
  ).join("");
  els.runFormationSelect.value = selectedFormationId;
  els.runFormationSelect.disabled = runnableFormations.length <= 1;
  els.runDefenseSelect.innerHTML = defenses.map(defense =>
    `<option value="${defense.id}">${escapeHtml(defense.name)}</option>`
  ).join("");
  els.runDefenseSelect.value = selectedDefenseId;
  els.runSpeedSelect.value = String(runSpeed);
  els.runDefenseMovementSelect.value = runDefenseMovement ? "on" : "off";
}

function applyFormation(formation) {
  if (!formation) return;
  currentPlay().formationId = formation.id;
  currentPlay().offensePositions = structuredClone(formation.offensePositions);
  currentPlay().labels = structuredClone(formation.labels);
  selectedFormationId = formation.id;
}

function mirroredPoint(point, sourceStart, targetStart) {
  return {
    ...point,
    x: targetStart.x - (point.x - sourceStart.x),
    y: targetStart.y + (point.y - sourceStart.y)
  };
}

function mirroredPath(path, sourceStart, targetStart) {
  return (path || []).map(point => mirroredPoint(point, sourceStart, targetStart));
}

function mirroredPlay(sourcePlay, sourceFormation, targetFormation) {
  const mirrored = createBlankPlay(sourcePlay.name);
  mirrored.formationId = targetFormation.id;
  mirrored.labels = structuredClone(targetFormation.labels);
  mirrored.offensePositions = structuredClone(targetFormation.offensePositions);
  mirrored.notes = (sourcePlay.notes || []).map(note => ({
    ...structuredClone(note),
    id: crypto.randomUUID(),
    x: Math.max(8, 900 - note.x - (note.width || 170))
  }));
  skillPositions.forEach(position => {
    const id = position.id;
    const sourceStart = sourceFormation.offensePositions[id];
    const targetStart = targetFormation.offensePositions[id];
    mirrored.routes[id] = mirroredPath(sourcePlay.routes[id], sourceStart, targetStart);
    mirrored.motions[id] = mirroredPath(sourcePlay.motions[id], sourceStart, targetStart);
    mirrored.routeOptions[id] = routeOptionsFor(sourcePlay, id).map(option => ({
      ...structuredClone(option),
      id: crypto.randomUUID(),
      points: mirroredPath(option.points, sourceStart, targetStart)
    }));
  });
  return mirrored;
}

function mirroredFormation(source) {
  const mirrored = {
    id: crypto.randomUUID(),
    name: `${source.name} Mirror`,
    labels: structuredClone(source.labels),
    offensePositions: Object.fromEntries(
      Object.entries(source.offensePositions).map(([id, point]) => [
        id,
        { x: 900 - point.x, y: point.y }
      ])
    ),
    notes: (source.notes || []).map(note => ({
      ...structuredClone(note),
      id: crypto.randomUUID(),
      x: Math.max(8, 900 - note.x - (note.width || 170))
    }))
  };
  return mirrored;
}

function pointAlong(from, to, distance) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ratio = Math.min(distance, length / 2) / length;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

function routePathData(position, route) {
  const points = [{ x: position.x, y: position.y }, ...route];
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const isRoundedBreak = Boolean(point.rounded) && index < points.length - 1;
    if (!isRoundedBreak) {
      path += ` L ${point.x} ${point.y}`;
      continue;
    }
    const before = pointAlong(point, points[index - 1], 20);
    const after = pointAlong(point, points[index + 1], 20);
    path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  return path;
}

function nearestRouteAnchor(start, route, point) {
  const path = [start, ...route];
  if (path.length < 2) return null;
  let nearest = null;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = (dx * dx) + (dy * dy);
    const t = lengthSquared
      ? Math.max(0, Math.min(1, (((point.x - from.x) * dx) + ((point.y - from.y) * dy)) / lengthSquared))
      : 0;
    const projected = { x: from.x + (dx * t), y: from.y + (dy * t) };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { segmentIndex: index, t, point: projected, distance };
    }
  }
  return nearest;
}

function appendRoutePath(container, start, route, attributes) {
  if (!route.length) return;
  const element = route.length === 1
    ? svgEl("line", {
        x1: start.x,
        y1: start.y,
        x2: route[0].x,
        y2: route[0].y
      })
    : svgEl("path", { d: routePathData(start, route) });
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  container.append(element);
}

function offensePosition(id) {
  const base = editorOffensePositions()[id];
  return animationState?.offense?.[id] || base;
}

function routeForFormation(id) {
  if (appTab === "run") return runScenarioRoute("offense", id);
  return currentPlay().routes[id] || [];
}

function motionEnd(start, motion) {
  return motion.length ? motion[motion.length - 1] : start;
}

function postSnapRoute(id, start = editorOffensePositions()[id]) {
  const route = routeForFormation(id);
  const motion = currentMotion(id);
  if (!motion.length) return route;
  const snapStart = motionEnd(start, motion);
  const dx = snapStart.x - start.x;
  const dy = snapStart.y - start.y;
  return route.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
}

function createPreviewRoute(id, start) {
  const selectedOption = id === activeRouteId ? selectedRouteOption(id) : null;
  const route = selectedOption
    ? branchedRoute(currentPlay(), id, selectedOption, start)
    : currentPlay().routes[id] || [];
  const motion = currentMotion(id);
  if (!motion.length) return route;
  const snapStart = motionEnd(start, motion);
  const dx = snapStart.x - start.x;
  const dy = snapStart.y - start.y;
  return route.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
}

function makeMovable(group, side, id) {
  group.classList.add("movable-player");
  group.addEventListener("click", event => {
    event.stopPropagation();
    const createMove = appTab === "create" && boardMode === "move"
      && ((side === "offense" && createScreen === "formation") || (side === "defense" && createScreen === "defense"));
    const scenarioSelect = appTab === "run" && scenarioEditing
      && (scenarioTool !== "man" || side === "defense");
    if (!createMove && !scenarioSelect) return;
    activeRouteSide = side;
    activeRouteId = id;
    if (appTab === "create") renderPlayControls();
    render();
  });
  group.addEventListener("pointerdown", event => {
    const createMove = appTab === "create" && boardMode === "move"
      && ((side === "offense" && createScreen === "formation") || (side === "defense" && createScreen === "defense"));
    const scenarioMove = appTab === "run" && scenarioEditing && scenarioTool === "move";
    if (!createMove && !scenarioMove) return;
    event.preventDefault();
    event.stopPropagation();
    activeRouteSide = side;
    activeRouteId = id;
    els.field.setPointerCapture(event.pointerId);
    dragState = { side, id, pointerId: event.pointerId };
  });
}

function appendSegmentSpeedControl(handle, point) {
  if ((point.speed || 1) !== 1) {
    const label = svgEl("text", {
      class: "segment-speed-label",
      x: 13,
      y: -11
    });
    label.textContent = `${Math.round((point.speed || 1) * 100)}%`;
    handle.append(label);
  }
  const foreignObject = svgEl("foreignObject", {
    class: "segment-speed-control",
    x: 12,
    y: -17,
    width: 92,
    height: 35
  });
  const select = document.createElementNS("http://www.w3.org/1999/xhtml", "select");
  select.className = "segment-speed-select";
  select.title = "Speed to this point";
  select.setAttribute("aria-label", "Speed to this route point");
  select.innerHTML = [
    [1, "100%"],
    [.75, "75%"],
    [.5, "50%"],
    [.25, "25%"],
    [.1, "10%"]
  ].map(([value, label]) =>
    `<option value="${value}">${label} to here</option>`
  ).join("");
  select.value = String(point.speed || 1);
  select.addEventListener("pointerdown", event => event.stopPropagation());
  select.addEventListener("click", event => event.stopPropagation());
  select.addEventListener("change", event => {
    event.stopPropagation();
    point.speed = Number(event.target.value) || 1;
    saveAllLibraries();
    renderRoutesAndPlayers();
  });
  foreignObject.append(select);
  handle.append(foreignObject);
}

function renderRoutesAndPlayers() {
  els.routes.innerHTML = "";
  els.players.innerHTML = "";
  els.activeRouteLabel.textContent = activeRouteDisplayLabel();
  const showOffensiveRoutes = appTab === "run" || (appTab === "create" && createScreen === "play");
  skillPositions.forEach(position => {
    const basePlayerPosition = editorOffensePositions()[position.id];
    const playerPosition = offensePosition(position.id);
    const motion = showOffensiveRoutes ? currentMotion(position.id) : [];
    const snapPosition = motionEnd(basePlayerPosition, motion);
    const route = showOffensiveRoutes ? postSnapRoute(position.id, basePlayerPosition) : [];
    const isSelectedOption = appTab === "create" && createScreen === "play"
      && activeRouteSide === "offense" && activeRouteId === position.id
      && selectedRouteOptionId !== "base";
    const runOption = appTab === "run"
      ? matchedRouteOption(currentPlay(), position.id, selectedDefenseId)
      : null;
    const showSplitRunOption = Boolean(runOption?.anchor && runOption.points.length && !scenarioEditing);
    const routeOffset = {
      x: snapPosition.x - basePlayerPosition.x,
      y: snapPosition.y - basePlayerPosition.y
    };
    appendRoutePath(els.routes, basePlayerPosition, motion, {
      fill: "none",
      stroke: "#76d7ff",
      "stroke-width": activeRouteSide === "offense" && position.id === activeRouteId && playPathType === "motion" ? 6 : 4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-dasharray": "7 6",
      "marker-end": motion.length ? "url(#motionArrow)" : "",
      opacity: .88
    });
    if (showSplitRunOption) {
      const parts = routeBranchParts(currentPlay(), position.id, runOption, basePlayerPosition);
      const displayedStem = parts.stem.map(point => ({
        ...point,
        x: point.x + routeOffset.x,
        y: point.y + routeOffset.y
      }));
      const displayedAnchor = {
        x: parts.anchor.x + routeOffset.x,
        y: parts.anchor.y + routeOffset.y
      };
      const displayedBranch = parts.branch.map(point => ({
        ...point,
        x: point.x + routeOffset.x,
        y: point.y + routeOffset.y
      }));
      appendRoutePath(els.routes, snapPosition, displayedStem, {
        fill: "none",
        stroke: "#f2c35a",
        "stroke-width": 5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: .82,
        filter: "url(#shadow)"
      });
      appendRoutePath(els.routes, displayedAnchor, displayedBranch, {
        fill: "none",
        stroke: "#c9f45c",
        "stroke-width": 5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": "9 6",
        "marker-end": "url(#optionArrow)",
        opacity: .95,
        filter: "url(#shadow)"
      });
    } else {
      appendRoutePath(els.routes, snapPosition, route, {
        fill: "none",
        stroke: "#f2c35a",
        "stroke-width": activeRouteSide === "offense" && position.id === activeRouteId && playPathType === "route" ? 7 : 5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "marker-end": route.length ? "url(#arrow)" : "",
        opacity: activeRouteSide === "offense" && position.id === activeRouteId ? 1 : .78,
        filter: "url(#shadow)"
      });
    }
    if (appTab === "create" && createScreen === "play") {
      const baseRoute = currentPlay().routes[position.id] || [];
      routeOptionsFor(currentPlay(), position.id).forEach(option => {
        const storedAnchor = routeAnchorPoint(basePlayerPosition, baseRoute, option.anchor);
        if (!storedAnchor) return;
        const displayAnchor = {
          x: storedAnchor.x + routeOffset.x,
          y: storedAnchor.y + routeOffset.y
        };
        const displayPoints = option.points.map(point => ({
          ...point,
          x: point.x + routeOffset.x,
          y: point.y + routeOffset.y
        }));
        const selected = isSelectedOption && option.id === selectedRouteOptionId;
        appendRoutePath(els.routes, displayAnchor, displayPoints, {
          fill: "none",
          stroke: "#c9f45c",
          "stroke-width": selected ? 6 : 4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": "9 6",
          "marker-end": displayPoints.length ? "url(#optionArrow)" : "",
          opacity: selected ? 1 : .62,
          filter: "url(#shadow)"
        });
        els.routes.append(svgEl("circle", {
          class: "route-branch-anchor",
          cx: displayAnchor.x,
          cy: displayAnchor.y,
          r: selected ? 7 : 5,
          fill: selected ? "#c9f45c" : "#10231c",
          stroke: "#c9f45c",
          "stroke-width": 3,
          opacity: selected ? 1 : .75
        }));
      });

      if (isSelectedOption && baseRoute.length) {
        const displayedBaseRoute = baseRoute.map(point => ({
          ...point,
          x: point.x + routeOffset.x,
          y: point.y + routeOffset.y
        }));
        const branchTarget = svgEl("path", {
          class: "route-branch-target",
          d: displayedBaseRoute.length === 1
            ? `M ${snapPosition.x} ${snapPosition.y} L ${displayedBaseRoute[0].x} ${displayedBaseRoute[0].y}`
            : routePathData(snapPosition, displayedBaseRoute),
          fill: "none",
          stroke: "rgba(201,244,92,.001)",
          "stroke-width": 26
        });
        branchTarget.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          const point = eventToFieldPoint(event);
          const nearest = nearestRouteAnchor(snapPosition, displayedBaseRoute, point);
          const option = selectedRouteOption(position.id);
          if (!nearest || !option) return;
          option.anchor = {
            segmentIndex: nearest.segmentIndex,
            t: nearest.t
          };
          renderPlayControls();
          render();
        });
        els.routes.append(branchTarget);
      }
    }

    const isSelected = (appTab === "create" || scenarioEditing) && activeRouteSide === "offense" && activeRouteId === position.id;
    const group = svgEl("g", { transform: `translate(${playerPosition.x} ${playerPosition.y})`, filter: "url(#shadow)" });
    if (isSelected) {
      group.classList.add("selected-player");
      group.append(svgEl("circle", { class: "selection-ring", r: 25 }));
    }
    group.classList.add("route-hit-target");
    makeMovable(group, "offense", position.id);
    group.addEventListener("click", event => {
      event.stopPropagation();
      const createMan = appTab === "create" && createScreen === "defense"
        && defenseAssignmentMode === "man" && activeRouteSide === "defense";
      const scenarioMan = appTab === "run" && scenarioEditing
        && scenarioTool === "man" && activeRouteSide === "defense";
      if (createMan || scenarioMan) {
        assignMan(activeRouteId, position.id);
        if (appTab === "create") saveDefenses();
        render();
        return;
      }
      if (appTab !== "create" || boardMode === "move" || createScreen !== "play") return;
      activeRouteSide = "offense";
      activeRouteId = position.id;
      renderPlayControls();
      renderRoutesAndPlayers();
    });
    group.append(svgEl("circle", {
      r: 18,
      fill: isSelected ? "#c9f45c" : "#f2c35a",
      stroke: isSelected ? "#f4ffd0" : "#fff5d7",
      "stroke-width": 3
    }));
    const text = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", fill: "#10231c", "font-size": 10, "font-weight": 950 });
    text.textContent = offenseLabel(position.id);
    group.append(text);
    els.players.append(group);

    const editingCreatePath = appTab === "create" && createScreen === "play"
      && activeRouteSide === "offense" && position.id === activeRouteId;
    const editingScenarioPath = appTab === "run" && scenarioEditing && scenarioTool === "draw"
      && activeRouteSide === "offense" && position.id === activeRouteId;
    if (editingCreatePath || editingScenarioPath) {
      const editingMotion = editingCreatePath && playPathType === "motion";
      const editablePath = editingMotion ? motion : routeForFormation(position.id);
      const displayOffset = !editingMotion && motion.length
        ? routeOffset
        : { x: 0, y: 0 };
      const optionAnchor = editingCreatePath && !editingMotion
        ? routeAnchorPoint(
            basePlayerPosition,
            currentPlay().routes[position.id] || [],
            selectedRouteOption(position.id)?.anchor
          )
        : null;
      editablePath.forEach((point, index) => {
        const displayPoint = !editingMotion
          ? {
              ...point,
              x: point.x + displayOffset.x,
              y: point.y + displayOffset.y
            }
          : point;
        const canRound = index < editablePath.length - 1;
        const handle = svgEl("g", { transform: `translate(${displayPoint.x} ${displayPoint.y})` });
        handle.classList.add("route-handle");
        if (canRound) handle.classList.add("round-toggle");
        handle.append(svgEl("circle", {
          r: canRound ? 9 : 7,
          fill: canRound && point.rounded ? "#c9f45c" : "#fffdf7",
          stroke: editingMotion
            ? "#76d7ff"
            : selectedRouteOptionId !== "base"
              ? "#7da829"
              : (canRound ? "#10231c" : "#f2c35a"),
          "stroke-width": 3
        }));
        if (editingCreatePath && !editingMotion && canRound) {
          appendSegmentSpeedControl(handle, point);
        }
        handle.addEventListener("pointerdown", event => beginPathPointDrag(
          event,
          editablePath,
          index,
          displayOffset,
          optionAnchor || basePlayerPosition,
          canRound
            ? () => {
                point.rounded = !point.rounded;
              }
            : null
        ));
        handle.addEventListener("click", event => event.stopPropagation());
        els.routes.append(handle);
      });
    }
  });

  offensiveLine.forEach(lineman => {
    const basePlayerPosition = editorOffensePositions()[lineman.id];
    const playerPosition = offensePosition(lineman.id);
    const route = appTab === "run" ? routeForFormation(lineman.id) : [];
    appendRoutePath(els.routes, basePlayerPosition, route, {
      fill: "none",
      stroke: "#f2c35a",
      "stroke-width": activeRouteSide === "offense" && lineman.id === activeRouteId ? 7 : 5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "marker-end": route.length ? "url(#arrow)" : "",
      opacity: .78,
      filter: "url(#shadow)"
    });
    const isSelected = (appTab === "create" || scenarioEditing) && activeRouteSide === "offense" && activeRouteId === lineman.id;
    const group = svgEl("g", { transform: `translate(${playerPosition.x} ${playerPosition.y})`, filter: "url(#shadow)" });
    if (isSelected) {
      group.classList.add("selected-player");
      group.append(svgEl("circle", { class: "selection-ring", r: 24 }));
    }
    makeMovable(group, "offense", lineman.id);
    group.append(svgEl("rect", {
      x: -15,
      y: -15,
      width: 30,
      height: 30,
      rx: 5,
      fill: isSelected ? "#c9f45c" : "#f2c35a",
      stroke: isSelected ? "#f4ffd0" : "#fff5d7",
      "stroke-width": 3
    }));
    const text = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", fill: "#10231c", "font-size": 9, "font-weight": 950 });
    text.textContent = lineman.label;
    group.append(text);
    els.players.append(group);
  });

  const qbStart = editorOffensePositions().QB;
  const qbPosition = offensePosition("QB");
  const qbRoute = appTab === "run" ? routeForFormation("QB") : [];
  appendRoutePath(els.routes, qbStart, qbRoute, {
    fill: "none",
    stroke: "#f2c35a",
    "stroke-width": activeRouteSide === "offense" && activeRouteId === "QB" ? 7 : 5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "marker-end": qbRoute.length ? "url(#arrow)" : "",
    opacity: .78,
    filter: "url(#shadow)"
  });
  const qbSelected = (appTab === "create" || scenarioEditing) && activeRouteSide === "offense" && activeRouteId === "QB";
  const qb = svgEl("g", { transform: `translate(${qbPosition.x} ${qbPosition.y})`, filter: "url(#shadow)" });
  if (qbSelected) {
    qb.classList.add("selected-player");
    qb.append(svgEl("circle", { class: "selection-ring", r: 26 }));
  }
  makeMovable(qb, "offense", "QB");
  qb.append(svgEl("circle", {
    r: 19,
    fill: qbSelected ? "#c9f45c" : "#f2c35a",
    stroke: qbSelected ? "#f4ffd0" : "#fff5d7",
    "stroke-width": 3
  }));
  const qbText = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", fill: "#10231c", "font-size": 10, "font-weight": 950 });
  qbText.textContent = "QB";
  qb.append(qbText);
  els.players.append(qb);
}

let defenderRenderIndex = 0;
let defenderStarts = {};

function defender(x, y, label = "") {
  const id = `D${defenderRenderIndex}`;
  defenderRenderIndex += 1;
  currentDefense().labels ||= {};
  const displayLabel = currentDefense().labels[id] || label || id;
  const saved = appTab === "run"
    ? (runScenario?.defensePositions[id] || currentDefense().positions[id])
    : currentDefense().positions[id];
  defenderStarts[id] = saved || { x, y };
  const playerPosition = animationState?.defense?.[id] || saved || { x, y };
  const route = appTab === "run" ? runScenarioRoute("defense", id) : (currentDefense().routes[id] || []);
  const manTarget = currentManAssignments()[id];
  const zoneAssignment = currentZoneAssignments()[id];
  if (zoneAssignment) {
    const selectedZone = activeRouteSide === "defense" && activeRouteId === id;
    els.zones.append(svgEl("circle", {
      cx: zoneAssignment.x,
      cy: zoneAssignment.y,
      r: zoneAssignment.radius || 125,
      fill: "rgba(118,215,255,.08)",
      stroke: "#76d7ff",
      "stroke-width": selectedZone ? 3 : 2,
      "stroke-dasharray": "8 7",
      opacity: selectedZone ? .78 : .42
    }));
    els.zones.append(svgEl("line", {
      x1: playerPosition.x,
      y1: playerPosition.y,
      x2: zoneAssignment.x,
      y2: zoneAssignment.y,
      stroke: "#76d7ff",
      "stroke-width": 2,
      "stroke-dasharray": "4 6",
      opacity: selectedZone ? .75 : .3
    }));
  }
  if (manTarget) {
    const targetPoint = offensePosition(manTarget);
    els.zones.append(svgEl("line", {
      x1: playerPosition.x,
      y1: playerPosition.y,
      x2: targetPoint.x,
      y2: targetPoint.y,
      stroke: "#c9f45c",
      "stroke-width": activeRouteSide === "defense" && activeRouteId === id ? 3 : 2,
      "stroke-dasharray": "5 5",
      opacity: activeRouteSide === "defense" && activeRouteId === id ? .95 : .48
    }));
  }
  if (route.length) {
    appendRoutePath(els.routes, saved || { x, y }, route, {
      fill: "none",
      stroke: "#ed7048",
      "stroke-width": activeRouteSide === "defense" && activeRouteId === id ? 7 : 4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-dasharray": "10 6",
      "marker-end": "url(#defenseArrow)",
      opacity: appTab === "run" ? .42 : .8
    });
  }
  const isSelected = (appTab === "create" || scenarioEditing) && activeRouteSide === "defense" && activeRouteId === id;
  const group = svgEl("g", { transform: `translate(${playerPosition.x} ${playerPosition.y})`, filter: "url(#shadow)" });
  makeMovable(group, "defense", id);
  if (isSelected) {
    group.classList.add("selected-player");
    group.append(svgEl("circle", { class: "selection-ring", r: 23 }));
  }
  group.addEventListener("click", event => {
    event.stopPropagation();
    const createDraw = appTab === "create" && boardMode === "draw";
    const scenarioDraw = appTab === "run" && scenarioEditing && scenarioTool === "draw";
    const createMan = appTab === "create" && createScreen === "defense" && defenseAssignmentMode === "man";
    const createZone = appTab === "create" && createScreen === "defense" && defenseAssignmentMode === "zone";
    const scenarioMan = appTab === "run" && scenarioEditing && scenarioTool === "man";
    if (!createDraw && !scenarioDraw && !createMan && !scenarioMan && !createZone) return;
    activeRouteSide = "defense";
    activeRouteId = id;
    renderPlayControls();
    render();
  });
  group.append(svgEl("circle", {
    r: 15,
    fill: isSelected ? "#c9f45c" : "#ed7048",
    stroke: isSelected ? "#f4ffd0" : "#ffd8ca",
    "stroke-width": 2
  }));
  const text = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", fill: "#30140c", "font-size": 8, "font-weight": 950 });
  text.textContent = displayLabel;
  group.append(text);
  els.defenders.append(group);

  if (appTab === "create" && createScreen === "defense") {
    const row = document.createElement("label");
    row.className = "defense-label-row";
    row.innerHTML = `<span>Player ${Number(id.slice(1)) + 1} (${escapeHtml(label || "DEF")})</span>`;
    const input = document.createElement("input");
    input.value = displayLabel;
    input.maxLength = 4;
    input.setAttribute("aria-label", `${id} defensive player label`);
    input.addEventListener("input", event => {
      const nextLabel = event.target.value.trim().toUpperCase() || label || id;
      currentDefense().labels[id] = nextLabel;
      text.textContent = nextLabel;
      saveDefenses();
    });
    row.append(input);
    const assignment = document.createElement("small");
    assignment.className = "defense-assignment-label";
    assignment.textContent = manTarget
      ? `Man: ${offenseLabel(manTarget)}`
      : zoneAssignment ? "Reactive zone"
      : route.length ? "Custom path" : "No movement";
    row.append(assignment);
    els.defenseLabels.append(row);
  }

  const editingCreatePath = appTab === "create" && createScreen === "defense"
    && activeRouteSide === "defense" && activeRouteId === id;
  const editingScenarioPath = appTab === "run" && scenarioEditing && scenarioTool === "draw"
    && activeRouteSide === "defense" && activeRouteId === id;
  if (editingCreatePath || editingScenarioPath) {
    route.forEach((point, index) => {
      const canRound = index < route.length - 1;
      const handle = svgEl("g", { transform: `translate(${point.x} ${point.y})` });
      handle.classList.add("route-handle");
      if (canRound) handle.classList.add("round-toggle");
      handle.append(svgEl("circle", {
        r: canRound ? 9 : 7,
        fill: canRound && point.rounded ? "#c9f45c" : "#fffdf7",
        stroke: "#ed7048",
        "stroke-width": 3
      }));
      handle.addEventListener("pointerdown", event => beginPathPointDrag(
        event,
        route,
        index,
        { x: 0, y: 0 },
        saved || { x, y },
        canRound
          ? () => {
              point.rounded = !point.rounded;
            }
          : null
      ));
      handle.addEventListener("click", event => event.stopPropagation());
      els.routes.append(handle);
    });
  }
}

function zone(x, y, width, height, label) {
  const rect = svgEl("rect", { x, y, width, height, rx: 36, fill: "rgba(237,112,72,.12)", stroke: "rgba(255,193,171,.48)", "stroke-width": 2, "stroke-dasharray": "8 7" });
  els.zones.append(rect);
  const text = svgEl("text", { x: x + width / 2, y: y + height / 2, "text-anchor": "middle", fill: "rgba(255,220,207,.76)", "font-size": 11, "font-weight": 900, "letter-spacing": 1 });
  text.textContent = label;
  els.zones.append(text);
}

function renderDefense() {
  els.defenders.innerHTML = "";
  els.zones.innerHTML = "";
  els.defenseLabels.innerHTML = "";
  if (appTab === "create" && createScreen !== "defense") return;
  defenderRenderIndex = 0;
  defenderStarts = {};
  const defaults = defaultDefensePositions();
  Object.keys(defaults).forEach((id, index) => {
    const point = defaults[id];
    defender(point.x, point.y, String(index + 1));
  });
}

function renderNotes() {
  els.notes.innerHTML = "";
  visibleNotes().forEach(note => {
    const dimensions = noteDimensions(note.text);
    note.width = dimensions.width;
    note.height = dimensions.height;
    const { width, height } = dimensions;
    const group = svgEl("g", { transform: `translate(${note.x} ${note.y})` });
    group.classList.add("field-note-box");
    const background = svgEl("rect", { x: 0, y: 0, width, height, rx: 5 });
    group.append(background);

    if (appTab === "create") {
      group.addEventListener("click", event => event.stopPropagation());
      const dragHandle = svgEl("rect", {
        x: 0,
        y: 0,
        width,
        height: 17,
        rx: 5,
        class: "note-drag-handle"
      });
      dragHandle.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        els.field.setPointerCapture(event.pointerId);
        dragState = {
          side: "note",
          note,
          pointerId: event.pointerId,
          offsetX: eventToFieldPoint(event).x - note.x,
          offsetY: eventToFieldPoint(event).y - note.y
        };
      });
      group.append(dragHandle);

      const foreignObject = svgEl("foreignObject", {
        x: 7,
        y: 0,
        width: width - 14,
        height
      });
      const editor = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      editor.className = "note-editor";
      const textarea = document.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
      textarea.value = note.text;
      textarea.placeholder = "Type a note";
      textarea.setAttribute("aria-label", "Field note");
      textarea.addEventListener("pointerdown", event => event.stopPropagation());
      textarea.addEventListener("click", event => event.stopPropagation());
      textarea.addEventListener("input", event => {
        note.text = event.target.value;
        const next = noteDimensions(note.text);
        note.width = next.width;
        note.height = next.height;
        note.x = Math.min(note.x, 900 - next.width - 8);
        note.y = Math.min(note.y, 620 - next.height - 8);
        group.setAttribute("transform", `translate(${note.x} ${note.y})`);
        background.setAttribute("width", next.width);
        background.setAttribute("height", next.height);
        dragHandle.setAttribute("width", next.width);
        foreignObject.setAttribute("width", next.width - 14);
        foreignObject.setAttribute("height", next.height);
        saveAllLibraries();
      });
      const removeButton = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      removeButton.type = "button";
      removeButton.className = "note-delete-button";
      removeButton.textContent = "\u00d7";
      removeButton.title = "Delete note";
      removeButton.setAttribute("aria-label", "Delete note");
      removeButton.addEventListener("pointerdown", event => event.stopPropagation());
      removeButton.addEventListener("click", event => {
        event.stopPropagation();
        currentNoteOwner().notes = currentNoteOwner().notes.filter(item => item.id !== note.id);
        saveAllLibraries();
        renderNotes();
      });
      editor.append(textarea, removeButton);
      foreignObject.append(editor);
      group.append(foreignObject);
    } else {
      const foreignObject = svgEl("foreignObject", {
        x: 9,
        y: 19,
        width: width - 18,
        height: height - 25
      });
      const display = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      display.className = "note-display";
      display.textContent = note.text;
      foreignObject.append(display);
      group.append(foreignObject);
    }
    els.notes.append(group);
  });
}

function noteDimensions(text) {
  const content = text || "";
  const lines = content.split("\n");
  const longestLine = Math.max(12, ...lines.map(line => line.length));
  const width = Math.max(170, Math.min(360, 80 + (longestLine * 7)));
  const charactersPerLine = Math.max(15, Math.floor((width - 30) / 7));
  const wrappedLines = lines.reduce((total, line) =>
    total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  const height = Math.max(62, 45 + (wrappedLines * 17));
  return { width, height };
}

function saveAllLibraries() {
  savePlays();
  saveFormations();
  saveDefenses();
}

function inferRouteTags(position, route) {
  if (!route.length) return [];
  const end = route[route.length - 1];
  const dx = end.x - position.x;
  const dy = end.y - position.y;
  const distance = Math.hypot(dx, dy);
  const tags = [];

  if (dy < -150) tags.push("vertical");
  if (distance < 145) tags.push("quick", "underneath");
  if (Math.abs(dy) < 95) tags.push("flat", "cross");
  if (route.length > 1) tags.push("break");
  if (Math.abs(end.x - 450) < Math.abs(position.x - 450)) tags.push("inside", "middle");
  if (Math.abs(end.x - 450) > Math.abs(position.x - 450)) tags.push("outside");
  if (dy < -165 && Math.abs(end.x - 450) < 180) tags.push("seam");
  return [...new Set(tags)];
}

function scoreRoute(position, route) {
  const tags = inferRouteTags(position, route);
  const bestTags = ["quick", "vertical", "inside", "outside", "break"];
  return tags.reduce((score, tag) => score + (bestTags.includes(tag) ? 1 : 0), 0);
}

function getRankedReads() {
  return skillPositions
    .filter(position => currentPlay().routes[position.id].length)
    .map(position => ({
      id: position.id,
      position: currentPlay().labels[position.id],
      route: currentPlay().routes[position.id],
      tags: inferRouteTags(offensePosition(position.id), currentPlay().routes[position.id]),
      score: scoreRoute(offensePosition(position.id), currentPlay().routes[position.id])
    }))
    .sort((a, b) => b.score - a.score);
}

function renderReads() {
  els.coachCue.textContent = "Build it, save it, and rep it against any defense.";
  if (appTab === "run") {
    els.boardTitle.textContent = `${currentPlay().name} | ${currentFormation().name} vs. ${currentDefense().name}`;
  } else if (createScreen === "formation") {
    els.boardTitle.textContent = currentFormation().name;
  } else if (createScreen === "defense") {
    els.boardTitle.textContent = currentDefense().name;
  } else {
    els.boardTitle.textContent = currentPlay().name;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function syncTabButtons() {
  document.querySelectorAll("[data-app-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.appTab === appTab);
  });
  document.querySelectorAll("[data-create-screen]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.createScreen === createScreen);
  });
}

function render() {
  document.body.classList.toggle("run-view", appTab === "run");
  document.body.classList.toggle("playbook-view", appTab === "playbook");
  document.body.classList.toggle("create-formation", appTab === "create" && createScreen === "formation");
  document.body.classList.toggle("create-play", appTab === "create" && createScreen === "play");
  document.body.classList.toggle("create-defense", appTab === "create" && createScreen === "defense");
  document.body.classList.toggle("scenario-editing", appTab === "run" && scenarioEditing);
  document.querySelector("#runToolbar").classList.toggle("hidden", appTab !== "run");
  els.field.classList.toggle(
    "move-mode",
    (appTab === "create" && boardMode === "move")
      || (appTab === "run" && scenarioEditing && scenarioTool === "move")
  );
  document.querySelector("#editScenarioButton").textContent = scenarioEditing ? "Done Editing" : "Edit Scenario";
  document.querySelector("#scenarioMoveButton").classList.toggle("active", scenarioTool === "move");
  document.querySelector("#scenarioDrawButton").classList.toggle("active", scenarioTool === "draw");
  document.querySelector("#scenarioManButton").classList.toggle("active", scenarioTool === "man");
  document.querySelector("#defensePathModeButton").classList.toggle("active", defenseAssignmentMode === "path");
  document.querySelector("#defenseZoneModeButton").classList.toggle("active", defenseAssignmentMode === "zone");
  document.querySelector("#defenseManModeButton").classList.toggle("active", defenseAssignmentMode === "man");
  document.querySelector("#drawRouteButton").classList.toggle("active", playPathType === "route");
  document.querySelector("#drawMotionButton").classList.toggle("active", playPathType === "motion");
  els.scenarioStatus.textContent = `${
    scenarioTool === "move" ? "Moving" : scenarioTool === "man" ? "Assigning man for" : "Drawing"
  } ${
    activeRouteSide === "offense" ? offenseLabel(activeRouteId) : (currentDefense().labels[activeRouteId] || activeRouteId)
  }`;
  els.defensePathHelp.textContent = defenseAssignmentMode === "man"
    ? "Click a defender, then click the receiver or back they guard."
    : defenseAssignmentMode === "zone"
      ? "Select a defender, then click the center of their zone. They will react to receivers entering it."
      : "Select a defender, then draw their custom movement path.";
  els.boardModeStatus.textContent = boardMode === "move"
    ? "Moving players"
    : createScreen === "defense" && defenseAssignmentMode === "man"
      ? "Assigning man for"
    : createScreen === "defense" && defenseAssignmentMode === "zone"
      ? "Placing zone for"
    : createScreen === "play" && playPathType === "motion"
      ? "Drawing motion for"
    : createScreen === "play" && selectedRouteOptionId !== "base"
      ? "Drawing option for"
    : activeRouteSide === "defense" ? "Drawing defender" : "Drawing";
  els.routeHelp.textContent = boardMode === "move"
    ? "Drag players into position. They snap to the line of scrimmage when close; hold Alt to place freely."
    : createScreen === "defense" && defenseAssignmentMode === "man"
      ? "Click a defender, then click the receiver or back they guard."
    : createScreen === "defense" && defenseAssignmentMode === "zone"
      ? "Click the field to place the selected defender's reactive zone."
    : createScreen === "play" && playPathType === "motion"
      ? "Click the field to draw pre-snap motion. The route will begin where the motion ends."
    : createScreen === "play" && selectedRouteOptionId !== "base"
      ? selectedRouteOption()?.anchor
        ? "Draw the dotted branch from the green point. Click the solid route again to move the branch point."
        : "Click anywhere on the solid base route to choose where this option branches."
    : activeRouteSide === "defense"
      ? "Click to add movement points. Drag a point to adjust it; hold Shift for a straight line."
      : "Click to add route points. Drag a point to adjust it; hold Shift for a straight line. Click a break point to round it.";
  const routeUnavailable = boardMode === "move" || (activeRouteSide === "offense" && !isSkillPosition(activeRouteId));
  document.querySelector("#undoPointButton").disabled = routeUnavailable;
  document.querySelector("#clearRouteButton").disabled = routeUnavailable;
  document.querySelector("#clearRouteButton").textContent = createScreen === "play" && playPathType === "motion"
    ? "Clear Motion"
    : createScreen === "play" && selectedRouteOptionId !== "base"
      ? "Clear Option"
    : createScreen === "defense" && defenseAssignmentMode === "man"
      ? "Clear Assignment"
    : createScreen === "defense" && defenseAssignmentMode === "zone"
      ? "Clear Zone"
    : "Clear Route";
  document.querySelector("#previewMovementButton").textContent = createScreen === "defense"
    ? "Preview Defense"
    : "Preview Play";
  els.fieldStandardSelect.value = fieldStandard;
  const screenCopy = {
    formation: ["Formation", "Create formation"],
    play: ["Offense", "Create play"],
    defense: ["Defense", "Create defense"]
  }[createScreen];
  els.leftPanelEyebrow.textContent = screenCopy[0];
  els.leftPanelTitle.textContent = screenCopy[1];
  els.fieldNote.textContent = appTab === "run"
    ? (activeRunRouteOptions().length
        ? `Active options: ${activeRunRouteOptions().map(item =>
            `${item.player} runs ${item.option.name}`
          ).join("; ")}.`
        : "No route options match this defense. The base routes will run.")
    : {
        formation: "Move players into position, edit receiver labels, name the formation, and save it.",
        play: "Choose a saved formation, select a receiver, and draw the named play.",
        defense: "Position defenders, then give each one a custom path, man assignment, or no movement."
      }[createScreen];
  document.querySelectorAll(".board-mode-button").forEach(button => {
    button.classList.toggle("active", button.dataset.boardMode === boardMode);
  });
  renderRoutesAndPlayers();
  renderDefense();
  renderNotes();
  renderReads();
  renderRunControls();
  renderPlaybookLibrary();
}

document.querySelector("#savePlayButton").addEventListener("click", () => {
  currentPlay().name = els.playName.value.trim() || "Untitled Play";
  currentPlay().formationId = selectedFormationId;
  if (draftPlay) {
    plays.push(draftPlay);
    selectedPlayId = draftPlay.id;
    draftPlay = null;
  }
  savePlays();
  showSaveSuccess();
  renderPlayControls();
  render();
});

document.querySelector("#mirrorPlayButton").addEventListener("click", () => {
  const targetFormation = formations.find(
    formation => formation.id === els.mirrorPlayFormationSelect.value
  );
  if (!targetFormation) return;

  let sourcePlay = currentPlay();
  sourcePlay.name = els.playName.value.trim() || "Untitled Play";
  sourcePlay.formationId = selectedFormationId;
  const sourceFormation = formations.find(
    formation => formation.id === sourcePlay.formationId
  ) || currentFormation();

  if (draftPlay) {
    plays.push(sourcePlay);
    selectedPlayId = sourcePlay.id;
    draftPlay = null;
    savePlays();
  }

  draftPlay = mirroredPlay(sourcePlay, sourceFormation, targetFormation);
  selectedFormationId = targetFormation.id;
  activeRouteSide = "offense";
  activeRouteId = "X";
  selectedRouteOptionId = "base";
  playPathType = "route";
  boardMode = "draw";
  renderPlayControls();
  render();
  showSaveSuccess("Original saved; mirrored play ready");
});

els.playName.addEventListener("input", event => {
  currentPlay().name = event.target.value;
});

els.fieldStandardSelect.addEventListener("change", event => {
  fieldStandard = event.target.value;
  localStorage.setItem("readroute-field-standard", fieldStandard);
  renderMarkings();
});

document.querySelector("#newPlayButton").addEventListener("click", () => {
  createScreen = "play";
  appTab = "create";
  animationState = null;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  document.querySelectorAll("[data-app-tab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.appTab === "create");
  });
  document.querySelectorAll("[data-create-screen]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.createScreen === "play");
  });
  draftPlay = createBlankPlay("");
  draftPlay.formationId = selectedFormationId;
  draftPlay.offensePositions = structuredClone(currentFormation().offensePositions);
  draftPlay.labels = structuredClone(currentFormation().labels);
  emptyPlayPaths(draftPlay);
  activeRouteId = "X";
  activeRouteSide = "offense";
  boardMode = "draw";
  playPathType = "route";
  selectedRouteOptionId = "base";
  renderPlayControls();
  render();
  els.playName.focus();
  els.playName.select();
});

function eventToFieldPoint(event) {
  const point = els.field.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(els.field.getScreenCTM().inverse());
  return {
    x: Math.max(18, Math.min(882, Math.round(transformed.x))),
    y: Math.max(18, Math.min(602, Math.round(transformed.y))),
    rounded: false,
    speed: 1
  };
}

function constrainRoutePoint(point, anchor, event) {
  if (!event.shiftKey || !anchor) return point;
  return Math.abs(point.x - anchor.x) >= Math.abs(point.y - anchor.y)
    ? { ...point, y: anchor.y }
    : { ...point, x: anchor.x };
}

function beginPathPointDrag(
  event,
  path,
  index,
  displayOffset = { x: 0, y: 0 },
  anchor = null,
  onTap = null
) {
  event.preventDefault();
  event.stopPropagation();
  els.field.setPointerCapture(event.pointerId);
  dragState = {
    side: "path-point",
    path,
    index,
    displayOffset,
    anchor,
    onTap,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false
  };
}

function updateDrawingGuide(event) {
  els.routes.querySelector(".drawing-guide")?.remove();
  let anchor = null;
  let color = "#f2c35a";
  let dashed = false;

  if (appTab === "create" && boardMode === "draw") {
    if (createScreen === "play" && activeRouteSide === "offense" && isSkillPosition(activeRouteId)) {
      const start = editorOffensePositions()[activeRouteId];
      const motion = currentMotion(activeRouteId);
      if (playPathType === "motion") {
        anchor = motion[motion.length - 1] || start;
        color = "#76d7ff";
        dashed = true;
      } else {
        const option = selectedRouteOption(activeRouteId);
        if (option) {
          const storedAnchor = option.points[option.points.length - 1]
            || routeAnchorPoint(start, currentPlay().routes[activeRouteId] || [], option.anchor);
          if (storedAnchor) {
            const snapStart = motionEnd(start, motion);
            anchor = {
              x: storedAnchor.x + (snapStart.x - start.x),
              y: storedAnchor.y + (snapStart.y - start.y)
            };
            color = "#c9f45c";
            dashed = true;
          }
        } else {
          const route = postSnapRoute(activeRouteId, start);
          anchor = route[route.length - 1] || motionEnd(start, motion);
        }
      }
    } else if (createScreen === "defense" && activeRouteSide === "defense"
      && defenseAssignmentMode === "path") {
      const route = currentDefense().routes[activeRouteId] || [];
      anchor = route[route.length - 1] || currentDefense().positions[activeRouteId];
      color = "#ed7048";
      dashed = true;
    }
  } else if (appTab === "run" && scenarioEditing && scenarioTool === "draw") {
    const route = runScenarioRoute(activeRouteSide, activeRouteId);
    if (activeRouteSide === "offense") {
      const start = editorOffensePositions()[activeRouteId];
      const displayedRoute = postSnapRoute(activeRouteId, start);
      anchor = displayedRoute[displayedRoute.length - 1] || motionEnd(start, currentMotion(activeRouteId));
    } else {
      anchor = route[route.length - 1] || runScenario.defensePositions[activeRouteId];
      color = "#ed7048";
      dashed = true;
    }
  }

  if (!anchor) return;
  const point = constrainRoutePoint(eventToFieldPoint(event), anchor, event);
  const guide = svgEl("line", {
    class: "drawing-guide",
    x1: anchor.x,
    y1: anchor.y,
    x2: point.x,
    y2: point.y,
    stroke: color,
    "stroke-width": 3,
    "stroke-linecap": "round",
    "stroke-dasharray": dashed ? "8 6" : "5 5",
    opacity: .72
  });
  els.routes.append(guide);
}

els.field.addEventListener("click", event => {
  if (Date.now() < suppressFieldClickUntil) {
    return;
  }
  if (appTab === "run" && scenarioEditing && scenarioTool === "draw") {
    if (activeRouteSide === "defense") {
      delete currentManAssignments()[activeRouteId];
      delete currentZoneAssignments()[activeRouteId];
    }
    const route = runScenarioRoute(activeRouteSide, activeRouteId);
    if (activeRouteSide === "offense") {
      const start = editorOffensePositions()[activeRouteId];
      const motion = currentMotion(activeRouteId);
      const snapStart = motionEnd(start, motion);
      const displayedRoute = postSnapRoute(activeRouteId, start);
      const anchor = displayedRoute[displayedRoute.length - 1] || snapStart;
      const constrained = constrainRoutePoint(eventToFieldPoint(event), anchor, event);
      route.push({
        ...constrained,
        x: constrained.x - (snapStart.x - start.x),
        y: constrained.y - (snapStart.y - start.y)
      });
    } else {
      const start = runScenario.defensePositions[activeRouteId];
      const anchor = route[route.length - 1] || start;
      route.push(constrainRoutePoint(eventToFieldPoint(event), anchor, event));
    }
    render();
    return;
  }
  if (appTab !== "create" || boardMode !== "draw") return;
  if (createScreen === "play" && activeRouteSide === "offense") {
    if (!isSkillPosition(activeRouteId)) return;
    const point = eventToFieldPoint(event);
    if (playPathType === "motion") {
      const motion = currentMotion(activeRouteId);
      const anchor = motion[motion.length - 1] || editorOffensePositions()[activeRouteId];
      motion.push(constrainRoutePoint(point, anchor, event));
    } else {
      const start = editorOffensePositions()[activeRouteId];
      const snapStart = motionEnd(start, currentMotion(activeRouteId));
      const route = editablePlayRoute(activeRouteId);
      const option = selectedRouteOption(activeRouteId);
      if (option) {
        const baseRoute = currentPlay().routes[activeRouteId] || [];
        const displayedBaseRoute = baseRoute.map(routePoint => ({
          ...routePoint,
          x: routePoint.x + (snapStart.x - start.x),
          y: routePoint.y + (snapStart.y - start.y)
        }));
        const nearest = nearestRouteAnchor(snapStart, displayedBaseRoute, point);
        if (nearest?.distance <= 20) {
          option.anchor = {
            segmentIndex: nearest.segmentIndex,
            t: nearest.t
          };
          renderPlayControls();
          render();
          return;
        }
      }
      const storedBranchAnchor = option
        ? routeAnchorPoint(start, currentPlay().routes[activeRouteId] || [], option.anchor)
        : null;
      if (option && !storedBranchAnchor) return;
      const displayedRoute = option
        ? option.points.map(routePoint => ({
            ...routePoint,
            x: routePoint.x + (snapStart.x - start.x),
            y: routePoint.y + (snapStart.y - start.y)
          }))
        : postSnapRoute(activeRouteId, start);
      const anchor = displayedRoute[displayedRoute.length - 1]
        || (storedBranchAnchor
          ? {
              x: storedBranchAnchor.x + (snapStart.x - start.x),
              y: storedBranchAnchor.y + (snapStart.y - start.y)
            }
          : snapStart);
      const constrained = constrainRoutePoint(point, anchor, event);
      route.push({
        ...constrained,
        x: constrained.x - (snapStart.x - start.x),
        y: constrained.y - (snapStart.y - start.y)
      });
    }
  } else if (createScreen === "defense" && activeRouteSide === "defense"
    && defenseAssignmentMode === "zone") {
    delete currentDefense().manAssignments[activeRouteId];
    currentDefense().routes[activeRouteId] = [];
    const point = eventToFieldPoint(event);
    const start = currentDefense().positions[activeRouteId];
    const depth = Math.max(0, lineOfScrimmage - start.y);
    currentDefense().zoneAssignments[activeRouteId] = {
      x: point.x,
      y: point.y,
      radius: depth > 220 ? 180 : depth > 120 ? 145 : 115
    };
  } else if (createScreen === "defense" && activeRouteSide === "defense"
    && defenseAssignmentMode === "path") {
    delete currentDefense().manAssignments[activeRouteId];
    delete currentDefense().zoneAssignments[activeRouteId];
    currentDefense().routes[activeRouteId] ||= [];
    const route = currentDefense().routes[activeRouteId];
    const anchor = route[route.length - 1] || currentDefense().positions[activeRouteId];
    route.push(constrainRoutePoint(eventToFieldPoint(event), anchor, event));
  } else {
    return;
  }
  renderPlayControls();
  render();
});

els.field.addEventListener("pointermove", event => {
  if (!dragState) {
    updateDrawingGuide(event);
    return;
  }
  if (appTab !== "create" && appTab !== "run") return;
  const point = eventToFieldPoint(event);
  if (dragState.side === "path-point") {
    const previous = dragState.index > 0
      ? dragState.path[dragState.index - 1]
      : dragState.anchor;
    const displayAnchor = previous
      ? {
          x: previous.x + dragState.displayOffset.x,
          y: previous.y + dragState.displayOffset.y
        }
      : null;
    const constrained = constrainRoutePoint(point, displayAnchor, event);
    dragState.path[dragState.index] = {
      ...dragState.path[dragState.index],
      x: constrained.x - dragState.displayOffset.x,
      y: constrained.y - dragState.displayOffset.y
    };
    dragState.moved ||= Math.hypot(
      event.clientX - dragState.startClientX,
      event.clientY - dragState.startClientY
    ) > 3;
    renderRoutesAndPlayers();
    renderDefense();
    return;
  }
  if (dragState.side === "note") {
    const maxX = 900 - (dragState.note.width || 170) - 8;
    const maxY = 620 - (dragState.note.height || 62) - 8;
    dragState.note.x = Math.max(8, Math.min(maxX, point.x - dragState.offsetX));
    dragState.note.y = Math.max(8, Math.min(maxY, point.y - dragState.offsetY));
    renderNotes();
    return;
  }
  if (appTab === "run") {
    if (!scenarioEditing || scenarioTool !== "move") return;
    const playerPoint = snapPlayerToScrimmage(point, event);
    if (dragState.side === "offense") {
      runScenario.offensePositions[dragState.id] = { x: playerPoint.x, y: playerPoint.y };
    } else {
      runScenario.defensePositions[dragState.id] = { x: playerPoint.x, y: playerPoint.y };
    }
    renderRoutesAndPlayers();
    renderDefense();
    return;
  }
  if (boardMode !== "move") return;
  const playerPoint = snapPlayerToScrimmage(point, event);
  if (dragState.side === "offense") {
    currentFormation().offensePositions[dragState.id] = { x: playerPoint.x, y: playerPoint.y };
    renderRoutesAndPlayers();
  } else {
    currentDefense().positions[dragState.id] = { x: playerPoint.x, y: playerPoint.y };
    renderDefense();
  }
});

els.formationSelect.addEventListener("change", event => {
  selectedFormationId = event.target.value;
  renderPlayControls();
  render();
});

els.playFormationSelect.addEventListener("change", event => {
  if (!draftPlay) return;
  selectedFormationId = event.target.value;
  emptyPlayPaths(draftPlay);
  applyFormation(currentFormation());
  renderPlayControls();
  render();
});

els.defenseSelect.addEventListener("change", event => {
  selectedDefenseId = event.target.value;
  defenseAssignmentMode = "path";
  activeRouteSide = "defense";
  activeRouteId = "D0";
  renderPlayControls();
  render();
});

document.querySelector("#newFormationButton").addEventListener("click", () => {
  const formation = {
    id: crypto.randomUUID(),
    name: `Formation ${formations.length + 1}`,
    labels: structuredClone(formations[0]?.labels || { X: "X", H: "H", Y: "Y", Z: "Z", RB: "RB" }),
    offensePositions: defaultOffensePositions(),
    notes: []
  };
  formations.push(formation);
  selectedFormationId = formation.id;
  saveFormations();
  renderPlayControls();
  els.formationName.focus();
  els.formationName.select();
});

document.querySelector("#saveFormationButton").addEventListener("click", () => {
  const formation = currentFormation();
  formation.name = els.formationName.value.trim() || "Untitled Formation";
  saveFormations();
  showSaveSuccess();
  renderPlayControls();
  render();
});

document.querySelector("#mirrorFormationButton").addEventListener("click", () => {
  const source = currentFormation();
  source.name = els.formationName.value.trim() || "Untitled Formation";
  saveFormations();
  const mirrored = mirroredFormation(source);
  formations.push(mirrored);
  selectedFormationId = mirrored.id;
  saveFormations();
  renderPlayControls();
  render();
  showSaveSuccess("Mirrored formation created");
  els.formationName.focus();
  els.formationName.select();
});

document.querySelector("#newDefenseButton").addEventListener("click", () => {
  const defense = createBlankDefense(`Defense ${defenses.length + 1}`, defenses[0]?.labels || {});
  defenses.push(defense);
  selectedDefenseId = defense.id;
  defenseAssignmentMode = "path";
  activeRouteSide = "defense";
  activeRouteId = "D0";
  saveDefenses();
  renderPlayControls();
  render();
  els.defenseName.focus();
  els.defenseName.select();
});

document.querySelector("#saveDefenseButton").addEventListener("click", () => {
  currentDefense().name = els.defenseName.value.trim() || "Untitled Defense";
  saveDefenses();
  showSaveSuccess();
  renderPlayControls();
  render();
});

els.runPlaySelect.addEventListener("change", event => {
  selectedPlayId = event.target.value;
  selectedFormationId = currentPlay().formationId || selectedFormationId;
  animationState = null;
  resetRunScenario();
  renderPlayControls();
  render();
});

els.runFormationSelect.addEventListener("change", event => {
  selectedFormationId = event.target.value;
  const firstFormationPlay = plays.find(play => play.formationId === selectedFormationId);
  if (firstFormationPlay) selectedPlayId = firstFormationPlay.id;
  animationState = null;
  resetRunScenario();
  renderPlayControls();
  render();
});

els.runDefenseSelect.addEventListener("change", event => {
  selectedDefenseId = event.target.value;
  animationState = null;
  resetRunScenario();
  render();
});

els.runSpeedSelect.addEventListener("change", event => {
  runSpeed = Number(event.target.value) || 1;
  resetAnimation();
});

els.runDefenseMovementSelect.addEventListener("change", event => {
  runDefenseMovement = event.target.value === "on";
  resetAnimation();
});

function pathLength(start, points) {
  let total = 0;
  let previous = start;
  points.forEach(point => {
    total += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  });
  return total;
}

function interpolatePath(start, points, distanceTraveled) {
  const path = [start, ...points];
  if (path.length === 1) return { ...start };
  const segments = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    total += length;
  }
  if (!total) return { ...start };
  let remaining = Math.min(distanceTraveled, total);
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length ? remaining / segment.length : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio
      };
    }
    remaining -= segment.length;
  }
  return { ...path[path.length - 1] };
}

function pathDuration(start, points, baseSpeed = 115) {
  let total = 0;
  let previous = start;
  points.forEach(point => {
    const segmentLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    total += segmentLength / (baseSpeed * (point.speed || 1));
    previous = point;
  });
  return total;
}

function interpolateTimedPath(start, points, elapsedSeconds, baseSpeed = 115) {
  let previous = start;
  let remaining = Math.max(0, elapsedSeconds);
  for (const point of points) {
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    const duration = length / (baseSpeed * (point.speed || 1));
    if (remaining <= duration) {
      const ratio = duration ? remaining / duration : 1;
      return {
        x: previous.x + ((point.x - previous.x) * ratio),
        y: previous.y + ((point.y - previous.y) * ratio)
      };
    }
    remaining -= duration;
    previous = point;
  }
  return points.length ? { ...points[points.length - 1] } : { ...start };
}

function moveManDefender(state, receiverPosition, elapsed, deltaSeconds) {
  const reactionTime = 0.16;
  if (elapsed < reactionTime || !deltaSeconds) {
    state.lastReceiver = { ...receiverPosition };
    return { x: state.x, y: state.y };
  }

  const receiverDx = receiverPosition.x - state.lastReceiver.x;
  const receiverDy = receiverPosition.y - state.lastReceiver.y;
  const receiverStep = Math.hypot(receiverDx, receiverDy);
  const directionX = receiverStep ? receiverDx / receiverStep : state.lastDirection.x;
  const directionY = receiverStep ? receiverDy / receiverStep : state.lastDirection.y;
  if (receiverStep) state.lastDirection = { x: directionX, y: directionY };

  const trailDistance = 12;
  const leverageDistance = 5;
  const targetX = receiverPosition.x
    - (directionX * trailDistance)
    + (state.leverage * -directionY * leverageDistance);
  const targetY = receiverPosition.y
    - (directionY * trailDistance)
    + (state.leverage * directionX * leverageDistance);
  const gapX = targetX - state.x;
  const gapY = targetY - state.y;
  const separation = Math.hypot(gapX, gapY);
  const recoveryBoost = separation > 70 ? 1.34 : separation > 38 ? 1.20 : 1.08;
  const maxSpeed = 115 * recoveryBoost;
  const desiredVx = separation ? (gapX / separation) * maxSpeed : 0;
  const desiredVy = separation ? (gapY / separation) * maxSpeed : 0;
  const acceleration = 620;
  const velocityChange = Math.hypot(desiredVx - state.vx, desiredVy - state.vy);
  const maxVelocityChange = acceleration * deltaSeconds;
  const velocityRatio = velocityChange
    ? Math.min(1, maxVelocityChange / velocityChange)
    : 0;

  state.vx += (desiredVx - state.vx) * velocityRatio;
  state.vy += (desiredVy - state.vy) * velocityRatio;
  state.x += state.vx * deltaSeconds;
  state.y += state.vy * deltaSeconds;
  state.lastReceiver = { ...receiverPosition };
  return { x: state.x, y: state.y };
}

function clampToZone(point, zone) {
  const dx = point.x - zone.x;
  const dy = point.y - zone.y;
  const distance = Math.hypot(dx, dy);
  const radius = zone.radius || 125;
  if (!distance || distance <= radius) return point;
  return {
    x: zone.x + ((dx / distance) * radius),
    y: zone.y + ((dy / distance) * radius)
  };
}

function moveZoneDefender(state, zone, receivers, elapsed, deltaSeconds) {
  const isDeepSafety = state.start.y < lineOfScrimmage - 190;
  const reactionTime = isDeepSafety ? .42 : .24;
  const radius = zone.radius || 125;
  const threats = receivers
    .map(receiver => ({
      ...receiver,
      zoneDistance: Math.hypot(receiver.x - zone.x, receiver.y - zone.y)
    }))
    .filter(receiver => receiver.zoneDistance <= radius * 1.18)
    .sort((a, b) => {
      if (isDeepSafety) return a.y - b.y || a.zoneDistance - b.zoneDistance;
      return a.zoneDistance - b.zoneDistance;
    });

  let target = { ...state.start };
  if (elapsed > .8 && !threats.length) {
    target = {
      x: state.start.x + ((zone.x - state.start.x) * .25),
      y: state.start.y + ((zone.y - state.start.y) * .25)
    };
  }
  if (elapsed >= reactionTime && threats.length) {
    const primary = threats[0];
    if (isDeepSafety) {
      const verticalThreats = threats.filter(receiver => receiver.y < lineOfScrimmage - 85);
      const left = verticalThreats.reduce((minimum, receiver) =>
        receiver.x < minimum.x ? receiver : minimum, primary);
      const right = verticalThreats.reduce((maximum, receiver) =>
        receiver.x > maximum.x ? receiver : maximum, primary);
      const midpointX = verticalThreats.length > 1
        ? (left.x + right.x) / 2
        : primary.x;
      target = {
        x: zone.x + ((midpointX - zone.x) * .68),
        y: Math.min(zone.y + 35, primary.y - 34)
      };
    } else {
      target = {
        x: zone.x + ((primary.x - zone.x) * .78),
        y: primary.y - 12
      };
    }
  }
  target = clampToZone(target, zone);

  const gapX = target.x - state.x;
  const gapY = target.y - state.y;
  const separation = Math.hypot(gapX, gapY);
  const maxSpeed = isDeepSafety ? 72 : 92;
  const desiredVx = separation ? (gapX / separation) * maxSpeed : 0;
  const desiredVy = separation ? (gapY / separation) * maxSpeed : 0;
  const acceleration = isDeepSafety ? 310 : 430;
  const velocityChange = Math.hypot(desiredVx - state.vx, desiredVy - state.vy);
  const maxVelocityChange = acceleration * deltaSeconds;
  const velocityRatio = velocityChange
    ? Math.min(1, maxVelocityChange / velocityChange)
    : 0;

  state.vx += (desiredVx - state.vx) * velocityRatio;
  state.vy += (desiredVy - state.vy) * velocityRatio;
  state.x += state.vx * deltaSeconds;
  state.y += state.vy * deltaSeconds;
  return { x: state.x, y: state.y };
}

function resetAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  animationState = null;
  render();
}

document.querySelector("#resetPlayButton").addEventListener("click", resetAnimation);

document.querySelector("#addNoteButton").addEventListener("click", () => {
  if (appTab !== "create") return;
  currentNoteOwner().notes ||= [];
  currentNoteOwner().notes.push(createNote());
  saveAllLibraries();
  renderNotes();
  els.notes.querySelector(".field-note-box:last-child textarea")?.focus();
});

function previewMovement(scope) {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationState = { offense: {}, defense: {} };
  const startedAt = performance.now();
  const baseSpeed = 115;
  const playbackScale = scope === "run" ? runSpeed : 1;
  const animateOffense = scope === "run" || scope === "play";
  const animateDefense = scope === "defense" || (scope === "run" && runDefenseMovement);
  const offenseEntries = scope === "play"
    ? skillPositions.map(position => [position.id, editorOffensePositions()[position.id]])
    : Object.entries(editorOffensePositions());
  const offensePaths = animateOffense
    ? offenseEntries.map(([id, start]) => ({
        id,
        start,
        motion: currentMotion(id),
        snapStart: motionEnd(start, currentMotion(id)),
        route: scope === "play"
          ? createPreviewRoute(id, start)
          : postSnapRoute(id, start)
      }))
    : [];
  const defensePaths = animateDefense
    ? Object.entries(defenderStarts).map(([id, start]) => ({
        id,
        start,
        route: scope === "run" ? runScenarioRoute("defense", id) : (currentDefense().routes[id] || []),
        manTarget: currentManAssignments()[id],
        zoneAssignment: currentZoneAssignments()[id],
        manState: {
          x: start.x,
          y: start.y,
          vx: 0,
          vy: 0,
          lastReceiver: {
            ...(editorOffensePositions()[currentManAssignments()[id]] || start)
          },
          lastDirection: { x: 0, y: -1 },
          leverage: Math.sign(start.x - (editorOffensePositions()[currentManAssignments()[id]]?.x ?? start.x)) || 1
        },
        zoneState: {
          x: start.x,
          y: start.y,
          vx: 0,
          vy: 0,
          start: { ...start }
        }
      }))
    : [];
  const maxMotionDuration = Math.max(
    0,
    ...offensePaths.map(path => pathDuration(path.start, path.motion, baseSpeed))
  );
  const maxPostSnapDuration = Math.max(
    0,
    ...offensePaths.map(path => pathDuration(path.snapStart, path.route, baseSpeed)),
    ...defensePaths.map(path => pathDuration(path.start, path.route, baseSpeed))
  );
  const totalDuration = maxMotionDuration + maxPostSnapDuration;
  let lastFrameAt = startedAt;

  function animate(now) {
    const elapsed = ((now - startedAt) / 1000) * playbackScale;
    const deltaSeconds = Math.min(.05, ((now - lastFrameAt) / 1000) * playbackScale);
    lastFrameAt = now;
    if (animateOffense) {
      offensePaths.forEach(({ id, start, motion, snapStart, route }) => {
        animationState.offense[id] = elapsed < maxMotionDuration
          ? interpolateTimedPath(start, motion, elapsed, baseSpeed)
          : interpolateTimedPath(snapStart, route, elapsed - maxMotionDuration, baseSpeed);
      });
    }
    if (animateDefense) {
      defensePaths.forEach(({ id, start, route, manTarget, zoneAssignment, manState, zoneState }) => {
        if (manTarget) {
          const targetStart = editorOffensePositions()[manTarget];
          const targetPosition = animationState.offense[manTarget] || targetStart;
          animationState.defense[id] = moveManDefender(
            manState,
            targetPosition,
            elapsed,
            deltaSeconds
          );
        } else if (zoneAssignment && elapsed >= maxMotionDuration) {
          const receivers = skillPositions.map(position => ({
            id: position.id,
            ...(animationState.offense[position.id] || editorOffensePositions()[position.id])
          }));
          animationState.defense[id] = moveZoneDefender(
            zoneState,
            zoneAssignment,
            receivers,
            elapsed - maxMotionDuration,
            deltaSeconds
          );
        } else if (elapsed >= maxMotionDuration) {
          animationState.defense[id] = interpolateTimedPath(
            start,
            route,
            elapsed - maxMotionDuration,
            baseSpeed
          );
        }
      });
    }
    renderRoutesAndPlayers();
    renderDefense();
    if (elapsed < totalDuration) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      animationFrame = null;
    }
  }

  animationFrame = requestAnimationFrame(animate);
}

document.querySelector("#runPlayButton").addEventListener("click", () => {
  previewMovement("run");
});

document.querySelector("#previewMovementButton").addEventListener("click", () => {
  if (appTab !== "create" || createScreen === "formation") return;
  previewMovement(createScreen);
});

function finishPlayerDrag() {
  if (!dragState) return;
  els.field.classList.remove("scrimmage-snapping");
  if (dragState.side === "path-point") {
    suppressFieldClickUntil = Date.now() + 300;
    if (!dragState.moved) dragState.onTap?.();
  }
  if (els.field.hasPointerCapture(dragState.pointerId)) {
    els.field.releasePointerCapture(dragState.pointerId);
  }
  dragState = null;
  if (appTab === "create") saveAllLibraries();
  render();
}

els.field.addEventListener("pointerup", finishPlayerDrag);
els.field.addEventListener("pointercancel", finishPlayerDrag);
els.field.addEventListener("pointerleave", event => {
  els.routes.querySelector(".drawing-guide")?.remove();
  if (event.buttons === 0) finishPlayerDrag();
});

document.querySelector("#undoPointButton").addEventListener("click", () => {
  if (activeRouteSide === "defense" && createScreen === "defense" && defenseAssignmentMode === "man") {
    delete currentDefense().manAssignments[activeRouteId];
    saveDefenses();
    render();
    return;
  }
  const selectedRoute = activeRouteSide === "offense"
    ? (createScreen === "play" && playPathType === "motion"
        ? currentMotion(activeRouteId)
        : editablePlayRoute(activeRouteId))
    : currentDefense().routes[activeRouteId];
  if (!Array.isArray(selectedRoute) || !selectedRoute.length) return;
  selectedRoute.splice(selectedRoute.length - 1, 1);
  saveAllLibraries();
  render();
});

document.querySelectorAll(".board-mode-button").forEach(button => {
  button.addEventListener("click", () => {
    boardMode = button.dataset.boardMode;
    if (boardMode === "draw" && activeRouteSide === "offense" && !isSkillPosition(activeRouteId)) {
      activeRouteId = "X";
    }
    dragState = null;
    document.querySelectorAll(".board-mode-button").forEach(modeButton => {
      modeButton.classList.toggle("active", modeButton === button);
    });
    render();
  });
});

document.querySelector("#clearRouteButton").addEventListener("click", () => {
  if (activeRouteSide === "offense") {
    if (createScreen === "play" && playPathType === "motion") {
      currentPlay().motions[activeRouteId] = [];
    } else {
      const route = editablePlayRoute(activeRouteId);
      route.splice(0, route.length);
    }
  } else {
    if (createScreen === "defense" && defenseAssignmentMode === "man") {
      delete currentDefense().manAssignments[activeRouteId];
    } else if (createScreen === "defense" && defenseAssignmentMode === "zone") {
      delete currentDefense().zoneAssignments[activeRouteId];
    } else {
      currentDefense().routes[activeRouteId] = [];
    }
  }
  saveAllLibraries();
  render();
});

document.querySelector("#drawRouteButton").addEventListener("click", () => {
  playPathType = "route";
  render();
});

document.querySelector("#drawMotionButton").addEventListener("click", () => {
  playPathType = "motion";
  render();
});

document.querySelector("#addRouteOptionButton").addEventListener("click", () => {
  if (createScreen !== "play" || activeRouteSide !== "offense"
    || !isSkillPosition(activeRouteId)) return;
  const options = routeOptionsFor(currentPlay(), activeRouteId);
  const option = {
    id: crypto.randomUUID(),
    name: `Option ${options.length + 1}`,
    defenseIds: [],
    anchor: null,
    points: []
  };
  options.push(option);
  selectedRouteOptionId = option.id;
  playPathType = "route";
  renderPlayControls();
  render();
  els.routeOptionName.focus();
  els.routeOptionName.select();
});

els.routeOptionSelect.addEventListener("change", event => {
  selectedRouteOptionId = event.target.value;
  playPathType = "route";
  renderPlayControls();
  render();
});

els.routeOptionName.addEventListener("input", event => {
  const option = selectedRouteOption();
  if (!option) return;
  option.name = event.target.value.trimStart() || "Untitled Option";
  const selectedEntry = [...els.routeOptionSelect.options]
    .find(entry => entry.value === option.id);
  if (selectedEntry) selectedEntry.textContent = option.name;
  els.activeRouteLabel.textContent = activeRouteDisplayLabel();
});

els.routeOptionDefense.addEventListener("change", event => {
  const option = selectedRouteOption();
  if (!option) return;
  const selectedDefenseIds = [...els.routeOptionDefense.querySelectorAll("input:checked")]
    .map(input => input.value);
  const usedByOtherOptions = new Set(
    routeOptionsFor(currentPlay(), activeRouteId)
      .filter(candidate => candidate.id !== option.id)
      .flatMap(candidate => candidate.defenseIds)
  );
  const conflicts = selectedDefenseIds.filter(defenseId => usedByOtherOptions.has(defenseId));
  if (conflicts.length) {
    const conflictNames = conflicts
      .map(defenseId => defenses.find(defense => defense.id === defenseId)?.name)
      .filter(Boolean)
      .join(", ");
    window.alert(`${offenseLabel(activeRouteId)} already has another option assigned to ${conflictNames}.`);
    els.routeOptionDefense.querySelectorAll("input").forEach(input => {
      input.checked = option.defenseIds.includes(input.value);
    });
    return;
  }
  option.defenseIds = selectedDefenseIds;
});

document.querySelector("#deleteRouteOptionButton").addEventListener("click", () => {
  const option = selectedRouteOption();
  if (!option || !window.confirm(`Delete route option "${option.name}"?`)) return;
  currentPlay().routeOptions[activeRouteId] = routeOptionsFor(currentPlay(), activeRouteId)
    .filter(candidate => candidate.id !== option.id);
  selectedRouteOptionId = "base";
  renderPlayControls();
  render();
});

document.querySelector("#editScenarioButton").addEventListener("click", () => {
  if (!runScenario) resetRunScenario();
  scenarioEditing = !scenarioEditing;
  animationState = null;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  render();
});

document.querySelector("#scenarioMoveButton").addEventListener("click", () => {
  scenarioTool = "move";
  render();
});

document.querySelector("#scenarioDrawButton").addEventListener("click", () => {
  scenarioTool = "draw";
  render();
});

document.querySelector("#scenarioManButton").addEventListener("click", () => {
  scenarioTool = "man";
  activeRouteSide = "defense";
  if (!String(activeRouteId).startsWith("D")) activeRouteId = "D0";
  render();
});

document.querySelector("#scenarioUndoButton").addEventListener("click", () => {
  if (scenarioTool === "man" && activeRouteSide === "defense") {
    delete currentManAssignments()[activeRouteId];
    render();
    return;
  }
  const route = runScenarioRoute(activeRouteSide, activeRouteId);
  if (route.length) route.pop();
  render();
});

document.querySelector("#scenarioClearButton").addEventListener("click", () => {
  if (activeRouteSide === "defense") {
    clearDefenderAssignment(activeRouteId);
  } else {
    const route = runScenarioRoute(activeRouteSide, activeRouteId);
    route.splice(0, route.length);
  }
  render();
});

document.querySelector("#defensePathModeButton").addEventListener("click", () => {
  defenseAssignmentMode = "path";
  boardMode = "draw";
  activeRouteSide = "defense";
  if (!String(activeRouteId).startsWith("D")) activeRouteId = "D0";
  render();
});

document.querySelector("#defenseZoneModeButton").addEventListener("click", () => {
  defenseAssignmentMode = "zone";
  boardMode = "draw";
  activeRouteSide = "defense";
  if (!String(activeRouteId).startsWith("D")) activeRouteId = "D0";
  render();
});

els.zoneSizeRange.addEventListener("input", event => {
  const zone = currentDefense().zoneAssignments?.[activeRouteId];
  if (!zone) return;
  zone.radius = Number(event.target.value);
  els.zoneSizeValue.textContent = event.target.value;
  saveDefenses();
  renderDefense();
});

document.querySelector("#defenseManModeButton").addEventListener("click", () => {
  defenseAssignmentMode = "man";
  boardMode = "draw";
  activeRouteSide = "defense";
  if (!String(activeRouteId).startsWith("D")) activeRouteId = "D0";
  render();
});

document.querySelector("#defenseNoMovementButton").addEventListener("click", () => {
  activeRouteSide = "defense";
  if (!String(activeRouteId).startsWith("D")) activeRouteId = "D0";
  clearDefenderAssignment(activeRouteId);
  saveDefenses();
  render();
});

document.querySelector("#scenarioResetButton").addEventListener("click", () => {
  resetRunScenario();
  render();
});

document.querySelectorAll("[data-app-tab]").forEach(button => {
  button.addEventListener("click", () => {
    appTab = button.dataset.appTab;
    if (appTab !== "create") draftPlay = null;
    if (appTab === "create" && createScreen === "play") {
      draftPlay = createBlankPlay("");
      draftPlay.formationId = selectedFormationId;
      draftPlay.offensePositions = structuredClone(currentFormation().offensePositions);
      draftPlay.labels = structuredClone(currentFormation().labels);
      emptyPlayPaths(draftPlay);
      playPathType = "route";
      selectedRouteOptionId = "base";
      activeRouteSide = "offense";
      activeRouteId = "X";
      boardMode = "draw";
    }
    if (appTab === "run") resetRunScenario();
    if (appTab !== "run") scenarioEditing = false;
    animationState = null;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    syncTabButtons();
    render();
  });
});

document.querySelectorAll("[data-create-screen]").forEach(button => {
  button.addEventListener("click", () => {
    createScreen = button.dataset.createScreen;
    animationState = null;
    activeRouteSide = createScreen === "defense" ? "defense" : "offense";
    activeRouteId = createScreen === "defense" ? "D0" : "X";
    boardMode = createScreen === "play" ? "draw" : "move";
    if (createScreen === "defense") defenseAssignmentMode = "path";
    if (createScreen === "play") {
      draftPlay = createBlankPlay("");
      draftPlay.formationId = selectedFormationId;
      draftPlay.offensePositions = structuredClone(currentFormation().offensePositions);
      draftPlay.labels = structuredClone(currentFormation().labels);
      emptyPlayPaths(draftPlay);
      playPathType = "route";
      selectedRouteOptionId = "base";
    } else {
      draftPlay = null;
    }
    document.querySelectorAll("[data-create-screen]").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });
    renderPlayControls();
    render();
  });
});

renderMarkings();
saveFormations();
saveDefenses();
savePlays();
renderPlayControls();
render();
