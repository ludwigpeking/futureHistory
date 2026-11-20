// The Last Day of AI, drawn after Alfred H. Barr, Jr.'s 1936 chart.
// A real prologue (2015–2026) is shared by every history; from 2027 the futures are simulated by the game's engine.
// Each history is laid out at the years it actually happened, so its path always runs down the sheet in time order;
// earlier histories stay behind as faint traces. Reads window.storyData (story-data.js).
(function () {
  "use strict";

  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  var WORLD_WIDTH = 3000;
  var FIELD_LEFT = 110;
  var FIELD_RIGHT = 2890;
  var PAPER_COLOR = "#d9d2c2";
  var INK_COLOR = "#1b1a17";
  var RED_COLOR = "#c42f26";
  var SUB_COLOR = "#3d3a33";
  var FONT_FAMILY = "Jost, Futura, 'Century Gothic', sans-serif";
  var TECH_LINE_PIXELS = 18;
  var EVENT_LINE_PIXELS = 19;
  var TECH_ABOVE_EVENT_PIXELS = 76;
  var TECH_ABOVE_TECH_PIXELS = 110;
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var story = window.storyData;
  var prologue = story.prologue;
  var stageElement = document.getElementById("stage");
  var nodeById = {};
  story.nodes.forEach(function (node) { nodeById[node.id] = node; });
  function baseId(nodeId) { return nodeId.split("@")[0]; }
  function unionNode(nodeId) { return nodeById[baseId(nodeId)]; }
  function edgeKindOf(fromId, toId) {
    if (fromId.indexOf("decision_") === 0) return "decision";
    if (fromId.indexOf("tech_") === 0 && toId.indexOf("tech_") === 0) return "lineage";
    return "activates";
  }
  var prologueNodeById = {};
  prologue.techs.forEach(function (tech) { prologueNodeById[tech.id] = tech; });
  prologue.events.forEach(function (prologueEvent) { prologueNodeById[prologueEvent.id] = prologueEvent; });
  var lineageEdges = story.edges.filter(function (edge) { return edge.kind === "lineage"; });

  // ── Time scale: the real past is spread wider (many events a year), then a strip for the game's starting
  //    conditions, then the simulated future from 2027 at its own scale. ─────────────────────────────────
  var PROLOGUE_FIRST_YEAR = 2015;
  var FUTURE_START_YEAR = prologue.futureStartYear;
  var PROLOGUE_PIXELS_PER_YEAR = 70;
  var FUTURE_PIXELS_PER_YEAR = 72;
  var TOP_PIXELS = 330;
  var PROLOGUE_BOTTOM_PIXELS = TOP_PIXELS + (FUTURE_START_YEAR - PROLOGUE_FIRST_YEAR) * PROLOGUE_PIXELS_PER_YEAR;
  // The strip holds technologies the game gives actors at the start that are not part of the real past,
  // stacked by how they build on each other within a history.
  var deepestStartingChain = 0;
  story.iterations.forEach(function (iteration) {
    var heldIds = {};
    var heldEdges = [];
    (iteration.startingTechs || []).forEach(function (step) {
      heldIds[step.nodeId] = true;
      (step.edges || []).forEach(function (edgeId) { var parts = edgeId.split(">"); heldEdges.push({ from: parts[0], to: parts[1] }); });
    });
    var depthMemo = {};
    function chainDepth(techId) {
      if (depthMemo[techId] !== undefined) return depthMemo[techId];
      depthMemo[techId] = 0;
      var deepest = 0;
      heldEdges.forEach(function (edge) { if (edge.from === techId && heldIds[edge.to]) deepest = Math.max(deepest, 1 + chainDepth(edge.to)); });
      depthMemo[techId] = deepest;
      return deepest;
    }
    Object.keys(heldIds).forEach(function (techId) { deepestStartingChain = Math.max(deepestStartingChain, chainDepth(techId)); });
  });
  var STARTING_BAND_PIXELS = 110 + deepestStartingChain * TECH_ABOVE_TECH_PIXELS + 40;
  var FUTURE_TOP_PIXELS = PROLOGUE_BOTTOM_PIXELS + STARTING_BAND_PIXELS;
  function yearToPixels(year) {
    if (year < FUTURE_START_YEAR) return TOP_PIXELS + (year - PROLOGUE_FIRST_YEAR) * PROLOGUE_PIXELS_PER_YEAR;
    return FUTURE_TOP_PIXELS + (year - FUTURE_START_YEAR) * FUTURE_PIXELS_PER_YEAR;
  }
  var FORK_PIXELS = yearToPixels(story.forkYear);
  var ENDING_ROW_PIXELS = yearToPixels(2089);
  var BAND_TOP_PIXELS = ENDING_ROW_PIXELS + 130;
  var WORLD_HEIGHT = BAND_TOP_PIXELS + 190;
  function embeddedX(node) { return 150 + node.embedX * (WORLD_WIDTH - 300); }
  function monthYearText(fractionalYear) {
    var wholeYear = Math.floor(fractionalYear);
    var monthIndex = Math.min(11, Math.floor((fractionalYear - wholeYear) * 12 + 0.0001));
    return MONTH_NAMES[monthIndex] + " " + wholeYear;
  }

  function createSvgElement(tagName, attributes, parentElement) {
    var element = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.keys(attributes || {}).forEach(function (attributeName) { element.setAttribute(attributeName, attributes[attributeName]); });
    if (parentElement) parentElement.appendChild(element);
    return element;
  }
  function addText(parentElement, content, attributes, withHalo) {
    var textElement = createSvgElement("text", attributes, parentElement);
    textElement.textContent = content;
    if (withHalo) {
      textElement.setAttribute("stroke", PAPER_COLOR);
      textElement.setAttribute("stroke-width", "4");
      textElement.setAttribute("stroke-linejoin", "round");
      textElement.setAttribute("paint-order", "stroke");
    }
    return textElement;
  }
  function titleCase(text) { return text.toLowerCase().replace(/(^|\s)\S/g, function (letter) { return letter.toUpperCase(); }); }
  function plainLabel(node) { return node.label.replace("\n", " "); }

  // ── Paper, axes, band ────────────────────────────────────────────────────
  function paperGrainDataUrl() {
    var tileCanvas = document.createElement("canvas");
    tileCanvas.width = 220; tileCanvas.height = 220;
    var context = tileCanvas.getContext("2d");
    var imageData = context.createImageData(220, 220);
    var seedValue = 12345;
    for (var pixelIndex = 0; pixelIndex < imageData.data.length; pixelIndex += 4) {
      seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff;
      var shade = seedValue % 255;
      imageData.data[pixelIndex] = 90; imageData.data[pixelIndex + 1] = 76; imageData.data[pixelIndex + 2] = 52;
      imageData.data[pixelIndex + 3] = shade < 120 ? Math.round(shade / 9) : 0;
    }
    context.putImageData(imageData, 0, 0);
    return tileCanvas.toDataURL("image/png");
  }
  function drawPaper(layers) {
    var definitions = createSvgElement("defs", {}, stageElement);
    var grainPattern = createSvgElement("pattern", { id: "grain", width: "220", height: "220", patternUnits: "userSpaceOnUse" }, definitions);
    createSvgElement("image", { href: paperGrainDataUrl(), width: "220", height: "220" }, grainPattern);
    [["arrow-ink", INK_COLOR], ["arrow-red", RED_COLOR]].forEach(function (markerSpec) {
      var marker = createSvgElement("marker", { id: markerSpec[0], viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, definitions);
      createSvgElement("path", { d: "M0 1.2 L10 5 L0 8.8 Z", fill: markerSpec[1] }, marker);
    });
    var openMarker = createSvgElement("marker", { id: "arrow-open", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "9", markerHeight: "9", orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, definitions);
    createSvgElement("path", { d: "M0.5 0.8 L9.5 5 L0.5 9.2", fill: "none", stroke: INK_COLOR, "stroke-width": "1.4", "stroke-linejoin": "miter" }, openMarker);
    createSvgElement("rect", { x: -4000, y: -4000, width: WORLD_WIDTH + 8000, height: WORLD_HEIGHT + 8000, fill: PAPER_COLOR }, layers.paper);
    createSvgElement("rect", { x: -4000, y: -4000, width: WORLD_WIDTH + 8000, height: WORLD_HEIGHT + 8000, fill: "url(#grain)" }, layers.paper);
  }
  var headerTopPixels = TOP_PIXELS - 150;
  function drawAxes(layers) {
    var axisFont = { "text-anchor": "middle", "font-family": FONT_FAMILY, "font-weight": "500", "font-size": "19", fill: "#b8463b" };
    function yearLabel(year, text) {
      addText(layers.axes, text || String(year), Object.assign({ x: 36, y: yearToPixels(year) + 6 }, axisFont));
      addText(layers.axes, text || String(year), Object.assign({ x: WORLD_WIDTH - 36, y: yearToPixels(year) + 6 }, axisFont));
    }
    for (var prologueYear = PROLOGUE_FIRST_YEAR; prologueYear < FUTURE_START_YEAR; prologueYear += 1) yearLabel(prologueYear);
    yearLabel(FUTURE_START_YEAR);
    for (var futureYear = 2030; futureYear <= 2085; futureYear += 5) yearLabel(futureYear);
    var headFont = { "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "15", "letter-spacing": "4", fill: "#6d6553" };
    addText(layers.axes, "TECHNOLOGIES IN ARCS, EVENTS BELOW  ·  FINE ARROWS: WHAT A TECHNOLOGY BUILDS ON  ·  IN RED: WHO REACHED IT FIRST, WHERE AN EVENT FIRED", Object.assign({ x: WORLD_WIDTH / 2, y: headerTopPixels }, headFont));
    var sectionFont = { "font-family": FONT_FAMILY, "font-size": "15", "font-weight": "600", "letter-spacing": "3", fill: RED_COLOR };
    addText(layers.axes, "THE REAL PAST", Object.assign({ x: 90, y: headerTopPixels + 50 }, sectionFont), true);
    // The 2027 line: where the real past ends and the simulated futures begin.
    createSvgElement("line", { x1: 70, y1: PROLOGUE_BOTTOM_PIXELS - 20, x2: WORLD_WIDTH - 70, y2: PROLOGUE_BOTTOM_PIXELS - 20, stroke: RED_COLOR, "stroke-width": "1.6" }, layers.axes);
    addText(layers.axes, FUTURE_START_YEAR + " · THE SIMULATED FUTURES BEGIN", Object.assign({ x: 90, y: PROLOGUE_BOTTOM_PIXELS - 32 }, sectionFont), true);
    addText(layers.axes, "THE GAME'S STARTING CONDITIONS: TECHNOLOGIES HELD AT THE START", Object.assign({ x: 90, y: PROLOGUE_BOTTOM_PIXELS + 8 }, sectionFont, { "font-size": "12", "font-weight": "500", fill: "#8a5a50" }), true);
    createSvgElement("line", { x1: 70, y1: FORK_PIXELS - 40, x2: WORLD_WIDTH - 70, y2: FORK_PIXELS - 40, stroke: RED_COLOR, "stroke-width": "1.2", "stroke-dasharray": "2 6" }, layers.axes);
    addText(layers.axes, story.forkYear + " · " + story.protagonist.name.toUpperCase() + " CHOOSES", Object.assign({ x: 90, y: FORK_PIXELS - 52 }, sectionFont), true);
    createSvgElement("line", { x1: 70, y1: ENDING_ROW_PIXELS - 60, x2: WORLD_WIDTH - 70, y2: ENDING_ROW_PIXELS - 60, stroke: INK_COLOR, "stroke-width": "1", "stroke-dasharray": "1 6" }, layers.axes);
    addText(layers.axes, "ENDINGS SO FAR", Object.assign({ x: 90, y: ENDING_ROW_PIXELS - 72 }, sectionFont), true);
  }
  var bandGroup = null;
  function buildBand(layers) {
    bandGroup = createSvgElement("g", {}, layers.axes);
    createSvgElement("rect", { x: 0, y: BAND_TOP_PIXELS, width: WORLD_WIDTH, height: 190, fill: RED_COLOR }, bandGroup);
    var title = addText(bandGroup, "THE LAST DAY OF AI", { x: WORLD_WIDTH / 2, y: BAND_TOP_PIXELS + 150, "text-anchor": "middle", "font-family": "Oswald, 'Arial Narrow', sans-serif", "font-size": "156", "font-weight": "600", fill: "#e3dccb", "letter-spacing": "6" });
    if (title.getComputedTextLength() > 2700) { title.setAttribute("textLength", "2700"); title.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  }

  // ── Node drawings, measured so brackets never touch their text ───────────
  // The actor is a red mark inside the node: who reached a technology first, or where an event fired.
  function buildMarkText(group, baselineY, whenText, actorText) {
    var textElement = createSvgElement("text", { x: 0, y: baselineY, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "11.5", fill: SUB_COLOR, "letter-spacing": "0.3", stroke: PAPER_COLOR, "stroke-width": "4", "stroke-linejoin": "round", "paint-order": "stroke" }, group);
    var whenSpan = createSvgElement("tspan", {}, textElement);
    var actorSpan = createSvgElement("tspan", { fill: RED_COLOR, "font-weight": "600", "letter-spacing": "1" }, textElement);
    whenSpan.textContent = whenText + (actorText ? " · " : "");
    actorSpan.textContent = actorText || "";
    return textElement;
  }
  // Draws one node with its mark into nodeLayer (its paper backing into backingLayer); returns the drawing and its extents.
  function buildNodeDrawing(node, mark, nodeLayer, backingLayer) {
    var group = createSvgElement("g", { "class": "node", "data-id": node.id }, nodeLayer);
    var extents;
    var labelLines = node.label.split("\n");
    if (node.kind === "tech") {
      var widestLabel = 0;
      labelLines.forEach(function (lineText, lineIndex) {
        var lineElement = addText(group, lineText, { x: 0, y: lineIndex * TECH_LINE_PIXELS, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "16", "font-weight": "500", "letter-spacing": "0.8", fill: INK_COLOR }, true);
        widestLabel = Math.max(widestLabel, lineElement.getComputedTextLength());
      });
      var lastBaseline = (labelLines.length - 1) * TECH_LINE_PIXELS;
      var rimY = lastBaseline + 6;
      var markElement = buildMarkText(group, rimY + 14, mark.when, mark.actor);
      var halfMark = markElement.getComputedTextLength() / 2;
      var bowlHalfWidth = Math.max(widestLabel / 2 + 10, halfMark * 1.55 + 8);
      var markRatio = halfMark / bowlHalfWidth;
      var bowlDepth = Math.max(20, 16.5 / (1 - markRatio * markRatio));
      var bowl = createSvgElement("path", { d: "M" + (-bowlHalfWidth) + " " + rimY + " Q0 " + (rimY + 2 * bowlDepth) + " " + bowlHalfWidth + " " + rimY, fill: "none", stroke: INK_COLOR, "stroke-width": "1.5" });
      group.insertBefore(bowl, group.firstChild);
      extents = { left: -bowlHalfWidth, right: bowlHalfWidth, top: -15, bottom: rimY + bowlDepth, inY: -16, outY: rimY + bowlDepth };
    } else if (node.kind === "decision") {
      var boxText = addText(group, node.label, { x: 0, y: 5.5, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "15", "font-weight": "500", "letter-spacing": "1", fill: INK_COLOR });
      var halfBox = boxText.getComputedTextLength() / 2 + 11;
      var frame = createSvgElement("rect", { x: -halfBox, y: -12, width: halfBox * 2, height: 24, fill: PAPER_COLOR, stroke: INK_COLOR, "stroke-width": "1.7" });
      group.insertBefore(frame, boxText);
      extents = { left: -halfBox, right: halfBox, top: -12, bottom: 12, inY: -12, outY: 12 };
    } else if (node.kind === "ending") {
      var widestEnding = 0;
      labelLines.forEach(function (lineText, lineIndex) {
        var endingLine = addText(group, lineText, { x: 0, y: lineIndex * 21, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "19", "font-weight": "600", "letter-spacing": "1", fill: INK_COLOR }, true);
        widestEnding = Math.max(widestEnding, endingLine.getComputedTextLength());
      });
      var endingLast = (labelLines.length - 1) * 21;
      var finaleElement = addText(group, node.finale, { x: 0, y: endingLast + 19, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "12", fill: RED_COLOR, "letter-spacing": "0.6" }, true);
      group.tallyElement = addText(group, "", { x: 0, y: endingLast + 40, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "13", "font-weight": "600", fill: INK_COLOR, "letter-spacing": "1" }, true);
      var halfEnding = Math.max(widestEnding, finaleElement.getComputedTextLength(), 120) / 2;
      extents = { left: -halfEnding, right: halfEnding, top: -17, bottom: endingLast + 46, inY: -18, outY: endingLast + 46 };
    } else {
      var widestEvent = 0;
      labelLines.forEach(function (lineText, lineIndex) {
        var eventStyle = { x: 0, y: lineIndex * EVENT_LINE_PIXELS, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "17", "font-weight": "500", fill: INK_COLOR };
        if (node.category === "forecast") eventStyle["font-style"] = "italic";
        if (node.category === "milestone") { eventStyle["font-size"] = "15"; eventStyle["letter-spacing"] = "2.2"; eventStyle["font-weight"] = "600"; }
        var eventLine = addText(group, node.category === "milestone" ? lineText.toUpperCase() : lineText, eventStyle, true);
        widestEvent = Math.max(widestEvent, eventLine.getComputedTextLength());
      });
      var eventLast = (labelLines.length - 1) * EVENT_LINE_PIXELS;
      var eventMark = buildMarkText(group, eventLast + 17, mark.when, mark.actor);
      var halfEvent = Math.max(widestEvent, eventMark.getComputedTextLength()) / 2;
      // The left side keeps room for the NEW tag, so it never runs into a neighbour.
      extents = { left: -halfEvent - 42, right: halfEvent, top: -15, bottom: eventLast + 20, inY: -16, outY: eventLast + 21 };
      group.newTag = addText(group, "NEW", { x: -halfEvent - 8, y: 0, "text-anchor": "end", "font-family": FONT_FAMILY, "font-size": "11", "font-weight": "600", "letter-spacing": "1.5", fill: RED_COLOR }, true);
      group.newTag.style.display = "none";
    }
    // The backing hugs the words only, so arrows are covered by text and nothing else.
    var textBoxes = Array.prototype.filter.call(group.querySelectorAll("text"), function (textElement) { return textElement !== group.newTag && textElement.textContent; })
      .map(function (textElement) { return textElement.getBBox(); });
    var textExtents = {
      left: Math.min.apply(null, textBoxes.map(function (box) { return box.x; })) - 5,
      top: Math.min.apply(null, textBoxes.map(function (box) { return box.y; })) - 2,
      right: Math.max.apply(null, textBoxes.map(function (box) { return box.x + box.width; })) + 5,
      bottom: Math.max.apply(null, textBoxes.map(function (box) { return box.y + box.height; })) + 2,
    };
    if (node.kind === "decision") textExtents = { left: extents.left, right: extents.right, top: extents.top, bottom: extents.bottom };
    // Arrows end just above the paper backing, so their tips are never covered by the words.
    extents.inY = Math.min(extents.inY, textExtents.top - 3);
    extents.top = Math.min(extents.top, extents.inY);
    var backing = createSvgElement("rect", { x: textExtents.left, y: textExtents.top, width: textExtents.right - textExtents.left, height: textExtents.bottom - textExtents.top, rx: "4", fill: PAPER_COLOR }, backingLayer);
    group.backing = backing;
    return { group: group, extents: extents, textExtents: textExtents };
  }
  function positionDrawing(record) {
    var transform = "translate(" + record.x.toFixed(1) + " " + record.y.toFixed(1) + ")";
    record.group.setAttribute("transform", transform);
    record.group.backing.setAttribute("transform", transform);
  }
  function boxesOf(record) {
    record.box = { left: record.x + record.extents.left, right: record.x + record.extents.right, top: record.y + record.extents.top, bottom: record.y + record.extents.bottom };
    record.textBox = { left: record.x + record.textExtents.left, right: record.x + record.textExtents.right, top: record.y + record.textExtents.top, bottom: record.y + record.textExtents.bottom };
  }

  // Sizes depend only on the label and the mark, so they are measured once per combination.
  var measureLayer = null;
  var measuredSizes = {};
  function measuredSize(node, mark) {
    var sizeKey = node.id + "|" + mark.when + "|" + mark.actor;
    if (!measuredSizes[sizeKey]) {
      var drawing = buildNodeDrawing(node, mark, measureLayer, measureLayer);
      measuredSizes[sizeKey] = { extents: drawing.extents, textExtents: drawing.textExtents };
      measureLayer.removeChild(drawing.group);
      measureLayer.removeChild(drawing.group.backing);
    }
    return measuredSizes[sizeKey];
  }

  // ── Placement: keep the year, move sideways first ───────────────────────
  function overlapsAny(box, placedBoxes) {
    for (var boxIndex = 0; boxIndex < placedBoxes.length; boxIndex++) {
      var other = placedBoxes[boxIndex];
      if (box.left - 14 < other.right && other.left - 14 < box.right && box.top - 10 < other.bottom && other.top - 10 < box.bottom) return true;
    }
    return false;
  }
  function placeNode(record, placedBoxes, preferredX, preferredY) {
    var extents = record.extents;
    var minimumX = FIELD_LEFT - extents.left;
    var maximumX = FIELD_RIGHT - extents.right;
    var startX = Math.min(Math.max(preferredX, minimumX), maximumX);
    for (var downStep = 0; downStep < 80; downStep++) {
      var candidateY = preferredY + downStep * 8;
      for (var sideStep = 0; sideStep < 70; sideStep++) {
        var candidateX = startX + (sideStep % 2 === 0 ? 1 : -1) * Math.ceil(sideStep / 2) * 22;
        if (candidateX < minimumX - 0.5 || candidateX > maximumX + 0.5) continue;
        var box = { left: candidateX + extents.left, right: candidateX + extents.right, top: candidateY + extents.top, bottom: candidateY + extents.bottom };
        if (!overlapsAny(box, placedBoxes)) { placedBoxes.push(box); record.x = candidateX; record.y = candidateY; boxesOf(record); return; }
      }
    }
    record.x = startX; record.y = preferredY;
    boxesOf(record);
    placedBoxes.push(record.box);
  }

  // ── Routing: a chain of vertical-tangent splines through detour points beside any words in the way ──
  function segmentPoint(fromPoint, toPoint, fanOffset, parameter) {
    var handle = Math.max(20, (toPoint.y - fromPoint.y) * 0.45);
    var firstControl = { x: fromPoint.x + fanOffset, y: fromPoint.y + handle };
    var secondControl = { x: toPoint.x, y: toPoint.y - handle };
    var inverse = 1 - parameter;
    return {
      x: inverse * inverse * inverse * fromPoint.x + 3 * inverse * inverse * parameter * firstControl.x + 3 * inverse * parameter * parameter * secondControl.x + parameter * parameter * parameter * toPoint.x,
      y: inverse * inverse * inverse * fromPoint.y + 3 * inverse * inverse * parameter * firstControl.y + 3 * inverse * parameter * parameter * secondControl.y + parameter * parameter * parameter * toPoint.y,
    };
  }
  function firstCollision(waypoints, fanOffset, obstacles) {
    for (var segmentIndex = 0; segmentIndex < waypoints.length - 1; segmentIndex++) {
      var segmentFan = segmentIndex === 0 ? fanOffset : 0;
      for (var sampleIndex = 1; sampleIndex < 28; sampleIndex++) {
        var point = segmentPoint(waypoints[segmentIndex], waypoints[segmentIndex + 1], segmentFan, sampleIndex / 28);
        for (var obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
          var box = obstacles[obstacleIndex];
          if (point.x > box.left - 7 && point.x < box.right + 7 && point.y > box.top - 7 && point.y < box.bottom + 7) return { segmentIndex: segmentIndex, box: box };
        }
      }
    }
    return null;
  }
  function collisionCount(waypoints, fanOffset, obstacles) {
    var hitIndexes = {};
    for (var segmentIndex = 0; segmentIndex < waypoints.length - 1; segmentIndex++) {
      for (var sampleIndex = 1; sampleIndex < 20; sampleIndex++) {
        var point = segmentPoint(waypoints[segmentIndex], waypoints[segmentIndex + 1], segmentIndex === 0 ? fanOffset : 0, sampleIndex / 20);
        for (var obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
          if (hitIndexes[obstacleIndex]) continue;
          var box = obstacles[obstacleIndex];
          if (point.x > box.left - 7 && point.x < box.right + 7 && point.y > box.top - 7 && point.y < box.bottom + 7) hitIndexes[obstacleIndex] = true;
        }
      }
    }
    return Object.keys(hitIndexes).length;
  }
  function routedPath(startPoint, endPoint, fanOffset, obstacles) {
    var waypoints = [startPoint, endPoint];
    for (var attempt = 0; attempt < 10; attempt++) {
      var collision = firstCollision(waypoints, fanOffset, obstacles);
      if (!collision) break;
      var fromPoint = waypoints[collision.segmentIndex];
      var toPoint = waypoints[collision.segmentIndex + 1];
      if (toPoint.y - fromPoint.y < 40) break;
      var detourY = Math.min(Math.max((collision.box.top + collision.box.bottom) / 2, fromPoint.y + 20), toPoint.y - 20);
      var leftOption = waypoints.slice(); leftOption.splice(collision.segmentIndex + 1, 0, { x: collision.box.left - 16, y: detourY });
      var rightOption = waypoints.slice(); rightOption.splice(collision.segmentIndex + 1, 0, { x: collision.box.right + 16, y: detourY });
      var middleX = (fromPoint.x + toPoint.x) / 2;
      var leftCost = collisionCount(leftOption, fanOffset, obstacles) * 1000 + Math.abs(collision.box.left - 16 - middleX);
      var rightCost = collisionCount(rightOption, fanOffset, obstacles) * 1000 + Math.abs(collision.box.right + 16 - middleX);
      waypoints = leftCost <= rightCost ? leftOption : rightOption;
    }
    var pathData = "M" + waypoints[0].x.toFixed(1) + " " + waypoints[0].y.toFixed(1);
    for (var segmentIndex = 0; segmentIndex < waypoints.length - 1; segmentIndex++) {
      var segmentStart = waypoints[segmentIndex];
      var segmentEnd = waypoints[segmentIndex + 1];
      var handle = Math.max(20, (segmentEnd.y - segmentStart.y) * 0.45);
      var segmentFan = segmentIndex === 0 ? fanOffset : 0;
      pathData += " C" + (segmentStart.x + segmentFan).toFixed(1) + " " + (segmentStart.y + handle).toFixed(1) + " " + segmentEnd.x.toFixed(1) + " " + (segmentEnd.y - handle).toFixed(1) + " " + segmentEnd.x.toFixed(1) + " " + segmentEnd.y.toFixed(1);
    }
    return pathData;
  }
  // Routes a set of edges between placed records: one exit point per source fanning apart, spread entry ports per target.
  function routeEdges(edgeList, recordOf, obstacleRecords) {
    var outgoingBySource = {};
    var incomingByTarget = {};
    edgeList.forEach(function (edge) {
      (outgoingBySource[edge.from] = outgoingBySource[edge.from] || []).push(edge);
      (incomingByTarget[edge.to] = incomingByTarget[edge.to] || []).push(edge);
    });
    var fanByEdge = {};
    Object.keys(outgoingBySource).forEach(function (sourceId) {
      var sortedOut = outgoingBySource[sourceId].slice().sort(function (first, second) { return recordOf(first.to).x - recordOf(second.to).x; });
      sortedOut.forEach(function (edge, rankIndex) { fanByEdge[edge.id] = sortedOut.length > 1 ? (rankIndex - (sortedOut.length - 1) / 2) * Math.min(14, 60 / sortedOut.length) : 0; });
    });
    var routed = [];
    Object.keys(incomingByTarget).forEach(function (targetId) {
      var targetRecord = recordOf(targetId);
      var edgesIn = incomingByTarget[targetId].slice().sort(function (first, second) { return recordOf(first.from).x - recordOf(second.from).x; });
      var portSpacing = Math.min(14, (targetRecord.box.right - targetRecord.box.left) / (edgesIn.length + 1));
      edgesIn.forEach(function (edge, portIndex) {
        var sourceRecord = recordOf(edge.from);
        var startX = sourceRecord.x;
        var startY = sourceRecord.y + sourceRecord.extents.outY;
        var endX = targetRecord.x + (portIndex - (edgesIn.length - 1) / 2) * portSpacing;
        var endY = targetRecord.y + targetRecord.extents.inY - 1;
        var corridorLeft = Math.min(startX, endX) - 420;
        var corridorRight = Math.max(startX, endX) + 420;
        var corridorTop = Math.min(startY, endY) - 20;
        var corridorBottom = Math.max(startY, endY) + 20;
        var obstacles = [];
        obstacleRecords.forEach(function (record) {
          if (record === sourceRecord || record === targetRecord) return;
          var box = record.textBox;
          if (box.right < corridorLeft || box.left > corridorRight || box.bottom < corridorTop || box.top > corridorBottom) return;
          obstacles.push(box);
        });
        var pathData;
        if (endY - startY > 20) {
          pathData = routedPath({ x: startX, y: startY }, { x: endX, y: endY }, fanByEdge[edge.id] || 0, obstacles);
        } else {
          var sideX = startX < targetRecord.x ? targetRecord.box.left - 4 : targetRecord.box.right + 4;
          var middleY = targetRecord.y + (targetRecord.extents.top + targetRecord.extents.bottom) / 2;
          var reach = Math.max(40, Math.abs(sideX - startX) * 0.35);
          pathData = "M" + startX.toFixed(1) + " " + startY.toFixed(1) + " C" + startX.toFixed(1) + " " + (startY + 46).toFixed(1) + " " + (sideX + (startX < sideX ? -reach : reach)).toFixed(1) + " " + middleY.toFixed(1) + " " + sideX.toFixed(1) + " " + middleY.toFixed(1);
        }
        routed.push({ id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, pathData: pathData });
      });
    });
    return routed;
  }

  // ── The static sheet: the real past, China's five choices, the endings ───
  var layers = {};
  var staticRecords = {};
  var staticEdgeRecords = [];
  function staticNodes() {
    return Object.keys(staticRecords).map(function (nodeId) { return staticRecords[nodeId]; });
  }
  function layoutStaticSheet() {
    var placedBoxes = [];
    function addStatic(node, mark) {
      var drawing = buildNodeDrawing(node, mark, layers.staticNodes, layers.staticBackings);
      var record = { node: node, mark: mark, group: drawing.group, extents: drawing.extents, textExtents: drawing.textExtents, isStatic: true };
      staticRecords[node.id] = record;
      return record;
    }
    story.nodes.filter(function (node) { return node.kind === "decision"; }).sort(function (first, second) { return first.order - second.order; }).forEach(function (node) {
      placeNode(addStatic(node, {}), placedBoxes, embeddedX(node), FORK_PIXELS);
    });
    story.nodes.filter(function (node) { return node.kind === "ending"; }).sort(function (first, second) { return first.order - second.order; }).forEach(function (node) {
      var record = addStatic(node, {});
      placeNode(record, placedBoxes, embeddedX(node), ENDING_ROW_PIXELS);
    });
    // Prologue x: technologies keep the embedding where the game uses them; the others sit between their neighbours.
    var prologueX = {};
    prologue.techs.forEach(function (tech) { if (tech.embedX !== null) prologueX[tech.id] = tech.embedX; });
    for (var round = 0; round < 6; round++) {
      prologue.techs.forEach(function (tech) {
        if (tech.embedX !== null) return;
        var neighbourPositions = prologue.edges.filter(function (edge) { return edge.kind === "lineage" && (edge.from === tech.id || edge.to === tech.id); })
          .map(function (edge) { return prologueX[edge.from === tech.id ? edge.to : edge.from]; }).filter(function (value) { return value !== undefined; });
        prologueX[tech.id] = neighbourPositions.length ? neighbourPositions.reduce(function (sum, value) { return sum + value; }, 0) / neighbourPositions.length : 0.5;
      });
    }
    var prologueEvents = prologue.events.slice().sort(function (first, second) { return first.year - second.year; });
    // Technologies sit above their first event and above the technologies they lead to.
    var preferredTechY = {};
    prologue.techs.forEach(function (tech) {
      var eventYs = prologueEvents.filter(function (prologueEvent) { return prologueEvent.techId === tech.id; }).map(function (prologueEvent) { return yearToPixels(prologueEvent.year); });
      preferredTechY[tech.id] = Math.min(yearToPixels(tech.year), eventYs.length ? Math.min.apply(null, eventYs) - TECH_ABOVE_EVENT_PIXELS : Infinity);
    });
    for (var constraintRound = 0; constraintRound < 6; constraintRound++) {
      prologue.edges.forEach(function (edge) {
        if (edge.kind === "lineage") preferredTechY[edge.from] = Math.min(preferredTechY[edge.from], preferredTechY[edge.to] - TECH_ABOVE_TECH_PIXELS);
      });
    }
    var highestTechY = Math.min.apply(null, Object.keys(preferredTechY).map(function (techId) { return preferredTechY[techId]; }));
    headerTopPixels = Math.min(TOP_PIXELS - 150, highestTechY - 90);
    prologueEvents.forEach(function (prologueEvent) {
      var record = addStatic(prologueEvent, { when: monthYearText(prologueEvent.year), actor: prologueEvent.place });
      placeNode(record, placedBoxes, embeddedX({ embedX: prologueX[prologueEvent.techId] }), yearToPixels(prologueEvent.year));
    });
    prologue.techs.slice().sort(function (first, second) { return preferredTechY[first.id] - preferredTechY[second.id]; }).forEach(function (tech) {
      var record = addStatic(tech, { when: String(tech.year), actor: tech.actor });
      var eventXs = prologue.events.filter(function (prologueEvent) { return prologueEvent.techId === tech.id; }).map(function (prologueEvent) { return staticRecords[prologueEvent.id].x; });
      var preferredX = eventXs.length ? eventXs.reduce(function (sum, value) { return sum + value; }, 0) / eventXs.length : embeddedX({ embedX: prologueX[tech.id] });
      placeNode(record, placedBoxes, preferredX, preferredTechY[tech.id]);
    });
    staticNodes().forEach(positionDrawing);
    staticPlacedBoxes = placedBoxes.slice();
    var routed = routeEdges(prologue.edges, function (nodeId) { return staticRecords[nodeId]; }, staticNodes());
    routed.forEach(function (routedEdge) {
      var isLineage = routedEdge.kind === "lineage";
      var element = createSvgElement("path", { d: routedEdge.pathData, fill: "none", stroke: INK_COLOR, "stroke-linecap": "round" }, isLineage ? layers.staticLineage : layers.staticEdges);
      staticEdgeRecords.push({ edge: routedEdge, element: element, length: element.getTotalLength(), isLineage: isLineage });
    });
  }
  var staticPlacedBoxes = [];

  // ── One history laid out at its own years ────────────────────────────────
  function layoutHistory(iteration) {
    var markByNode = {};
    var allSteps = (iteration.startingTechs || []).concat(iteration.steps);
    allSteps.forEach(function (step) { (step.marks || []).forEach(function (mark) { if (!markByNode[mark.nodeId]) markByNode[mark.nodeId] = mark; }); });
    var liveRecords = {};
    var eventYears = {};
    var historyEdges = [];
    var seenEdges = {};
    allSteps.forEach(function (step) {
      if (step.kind === "event" || step.kind === "ending") eventYears[step.nodeId] = step.year;
      (step.edges || []).forEach(function (edgeId) {
        if (seenEdges[edgeId]) return;
        seenEdges[edgeId] = true;
        var parts = edgeId.split(">");
        historyEdges.push({ id: edgeId, from: parts[0], to: parts[1], kind: edgeKindOf(parts[0], parts[1]) });
      });
    });
    function liveRecordFor(nodeId) {
      if (staticRecords[nodeId]) return null;
      if (liveRecords[nodeId]) return liveRecords[nodeId];
      var node = unionNode(nodeId);
      var mark = markByNode[nodeId] || { when: "", actor: "" };
      var size = measuredSize(node, mark);
      liveRecords[nodeId] = { node: node, mark: mark, extents: size.extents, textExtents: size.textExtents };
      return liveRecords[nodeId];
    }
    Object.keys(eventYears).forEach(liveRecordFor);
    allSteps.forEach(function (step) { if (step.kind === "tech") liveRecordFor(step.nodeId); });
    historyEdges.forEach(function (edge) { liveRecordFor(edge.from); liveRecordFor(edge.to); });
    function recordOf(nodeId) { return staticRecords[nodeId] || liveRecords[nodeId]; }

    var placedBoxes = staticPlacedBoxes.slice();
    // Events exactly at their year (they move sideways, never up or down, to make room).
    Object.keys(eventYears).sort(function (first, second) { return eventYears[first] - eventYears[second]; }).forEach(function (eventId) {
      placeNode(liveRecords[eventId], placedBoxes, embeddedX(unionNode(eventId)), yearToPixels(eventYears[eventId]));
    });
    // Technologies: at the year they were reached, above the first event they activate and above what they lead to.
    var liveTechIds = Object.keys(liveRecords).filter(function (nodeId) { return liveRecords[nodeId].node.kind === "tech"; });
    var preferredY = {};
    var startingDepth = {};
    function heldAtStart(techId) { return liveRecords[techId].mark.year === null || liveRecords[techId].mark.year === undefined; }
    function depthBelow(techId) {
      if (startingDepth[techId] !== undefined) return startingDepth[techId];
      startingDepth[techId] = 0;
      var deepest = 0;
      historyEdges.forEach(function (edge) { if (edge.kind === "lineage" && edge.from === techId && liveRecords[edge.to] && heldAtStart(edge.to)) deepest = Math.max(deepest, 1 + depthBelow(edge.to)); });
      startingDepth[techId] = deepest;
      return deepest;
    }
    liveTechIds.forEach(function (techId) {
      var targetYs = historyEdges.filter(function (edge) { return edge.from === techId && edge.kind === "activates"; }).map(function (edge) {
        var target = recordOf(edge.to);
        return target.y !== undefined ? target.y : ENDING_ROW_PIXELS;
      });
      var ceiling = targetYs.length ? Math.min.apply(null, targetYs) - TECH_ABOVE_EVENT_PIXELS : ENDING_ROW_PIXELS - TECH_ABOVE_EVENT_PIXELS;
      if (heldAtStart(techId)) preferredY[techId] = Math.min(ceiling, FUTURE_TOP_PIXELS - 70 - depthBelow(techId) * TECH_ABOVE_TECH_PIXELS);
      else preferredY[techId] = Math.min(ceiling, yearToPixels(liveRecords[techId].mark.year));
    });
    for (var constraintRound = 0; constraintRound < 5; constraintRound++) {
      historyEdges.forEach(function (edge) {
        if (edge.kind === "lineage" && preferredY[edge.from] !== undefined && preferredY[edge.to] !== undefined) {
          preferredY[edge.from] = Math.min(preferredY[edge.from], preferredY[edge.to] - TECH_ABOVE_TECH_PIXELS);
        }
      });
    }
    liveTechIds.forEach(function (techId) { preferredY[techId] = Math.max(preferredY[techId], PROLOGUE_BOTTOM_PIXELS + 30); });
    liveTechIds.sort(function (first, second) { return preferredY[first] - preferredY[second]; }).forEach(function (techId) {
      var targetXs = historyEdges.filter(function (edge) { return edge.from === techId && edge.kind === "activates" && liveRecords[edge.to]; }).map(function (edge) { return liveRecords[edge.to].x; });
      var preferredX = targetXs.length ? targetXs.reduce(function (sum, value) { return sum + value; }, 0) / targetXs.length : embeddedX(unionNode(techId));
      placeNode(liveRecords[techId], placedBoxes, preferredX, preferredY[techId]);
    });
    var obstacleRecords = staticNodes().concat(Object.keys(liveRecords).map(function (nodeId) { return liveRecords[nodeId]; }));
    var routed = routeEdges(historyEdges, recordOf, obstacleRecords);
    return { records: liveRecords, edges: routed };
  }

  // ── Histories: the prologue, then each simulated history with its cues ───
  var prologueSpan = null;
  var histories = [];
  var totalBeats = 0;
  var stageAspect = 0.6;
  var endingCountsBefore = [];

  function cameraOn(focusX, focusY, relatedRecords, minimumWidth) {
    var halfWidthNeeded = 0;
    var halfHeightNeeded = 0;
    relatedRecords.forEach(function (record) {
      if (!record || !record.box) return;
      if (Math.abs(record.x - focusX) > 800 || Math.abs(record.y - focusY) > 420) return;
      halfWidthNeeded = Math.max(halfWidthNeeded, Math.abs(record.box.left - focusX), Math.abs(record.box.right - focusX));
      halfHeightNeeded = Math.max(halfHeightNeeded, Math.abs(record.box.top - focusY), Math.abs(record.box.bottom - focusY));
    });
    var width = Math.max(minimumWidth, 2 * halfWidthNeeded + 220, (2 * halfHeightNeeded + 200) / stageAspect);
    width = Math.min(width, minimumWidth > 2000 ? 3300 : 1800);
    return { x: focusX - width / 2, y: focusY - width * stageAspect / 2, width: width, height: width * stageAspect };
  }

  function buildPrologueSpan() {
    var span = { isPrologue: true, start: 0, steps: [], appear: {}, cues: [] };
    span.steps.push({
      kind: "intro", start: 0, length: 1.4,
      camera: cameraOn(WORLD_WIDTH / 2, (headerTopPixels + PROLOGUE_BOTTOM_PIXELS) / 2, [], 2900),
      caption: { kicker: "The real past · " + PROLOGUE_FIRST_YEAR + "–" + (FUTURE_START_YEAR - 1), headline: "What has already happened", body: "Real technologies, when and by whom they were first made, and the familiar events they made possible.", meta: "From " + FUTURE_START_YEAR + " every history is simulated by the game's engine." },
    });
    var localBeat = 1.4;
    var shown = {};
    prologue.events.slice().sort(function (first, second) { return first.year - second.year; }).forEach(function (prologueEvent) {
      var tech = prologueNodeById[prologueEvent.techId];
      var newTechs = [];
      function revealTech(techId) {
        if (shown[techId]) return;
        prologue.edges.forEach(function (edge) { if (edge.kind === "lineage" && edge.to === techId) revealTech(edge.from); });
        shown[techId] = true;
        newTechs.push(techId);
      }
      revealTech(tech.id);
      newTechs.forEach(function (techId, techIndex) {
        span.appear[techId] = localBeat + 0.4 * techIndex / Math.max(1, newTechs.length);
        span.cues.push({ beat: localBeat + span.appear[techId] - localBeat, kind: "tech", position: staticRecords[techId].x / WORLD_WIDTH });
      });
      span.appear[prologueEvent.id] = localBeat + 0.45;
      span.cues.push({ beat: localBeat + 0.45, kind: "event", position: staticRecords[prologueEvent.id].x / WORLD_WIDTH });
      var record = staticRecords[prologueEvent.id];
      span.steps.push({
        kind: "event", nodeId: prologueEvent.id, year: Math.floor(prologueEvent.year), start: localBeat, length: 1,
        camera: cameraOn(record.x, record.y, [record, staticRecords[tech.id]], 1250),
        caption: { kicker: monthYearText(prologueEvent.year) + " · The real past", headline: plainLabel(prologueEvent), body: prologueEvent.note, meta: "Made possible by " + titleCase(plainLabel(tech)) + ", first made by " + titleCase(tech.actor) + " in " + tech.year + ". " + tech.note },
      });
      localBeat += 1;
    });
    span.length = localBeat;
    return span;
  }

  function buildHistories() {
    stageAspect = stageElement.clientHeight / Math.max(1, stageElement.clientWidth);
    prologueSpan = buildPrologueSpan();
    var runningEndings = {};
    var beat = prologueSpan.length;
    var previous = null;
    story.iterations.forEach(function (iteration, iterationIndex) {
      endingCountsBefore.push(Object.assign({}, runningEndings));
      var history = { iteration: iteration, index: iterationIndex, start: beat, steps: [], appear: {}, edgeAppear: {}, eventIds: [], layout: null, cues: [] };
      function recordOf(nodeId) { return staticRecords[nodeId] || { node: unionNode(nodeId) }; }
      var shown = {};
      var previousEventIds = previous ? previous.eventIds : [];
      var samePast = previous && previous.iteration.seed === iteration.seed;
      history.steps.push({
        kind: "intro", start: 0, length: 1.2,
        camera: cameraOn(WORLD_WIDTH / 2, FUTURE_TOP_PIXELS + 160, [], 2900),
        caption: {
          kicker: "History " + (iterationIndex + 1) + " of " + story.iterations.length + " · seed " + iteration.seed + (iteration.rerollIndex ? " · dice " + iteration.rerollIndex : ""),
          headline: samePast ? "Same past, " + (previous.iteration.policyId === iteration.policyId ? "new dice" : "a different choice") : "A new future",
          body: samePast ? "Up to " + story.forkYear + " this history repeats the last one exactly. Watch for where it turns." : "From " + FUTURE_START_YEAR + " the world unfolds differently: a new seed for the game's engine.",
          meta: previous ? "The last history ended in " + titleCase(story.endings[previous.iteration.ending].label) + "; its path stays behind as a faint trace." : "Every history leaves a trace on the sheet.",
        },
      });
      (iteration.startingTechs || []).forEach(function (startingStep, startingIndex) {
        history.appear[startingStep.nodeId] = 0.25 + 0.85 * startingIndex / Math.max(1, iteration.startingTechs.length);
        shown[startingStep.nodeId] = true;
        (startingStep.edges || []).forEach(function (edgeId) { history.edgeAppear[edgeId] = history.appear[startingStep.nodeId]; });
      });
      var localBeat = 1.2;
      var divergenceMarked = false;
      iteration.steps.forEach(function (step) {
        var stepLength = step.kind === "ending" ? 2.4 : step.kind === "decision" ? 1.3 : step.kind === "tech" ? 0.5 : 1;
        var stepEdges = step.edges || [];
        var newSources = [];
        stepEdges.forEach(function (edgeId) {
          var sourceId = edgeId.split(">")[0];
          if (!shown[sourceId] && !staticRecords[sourceId] && newSources.indexOf(sourceId) < 0) newSources.push(sourceId);
        });
        newSources.forEach(function (sourceId, sourceIndex) {
          shown[sourceId] = true;
          history.appear[sourceId] = localBeat + 0.4 * sourceIndex / Math.max(1, newSources.length);
          history.cues.push({ beat: history.start + history.appear[sourceId], kind: "tech", nodeId: sourceId });
        });
        shown[step.nodeId] = true;
        history.appear[step.nodeId] = localBeat + (step.kind === "tech" ? 0.2 : 0.45);
        stepEdges.forEach(function (edgeId) { history.edgeAppear[edgeId] = localBeat + (step.kind === "tech" ? 0.05 : 0.3); });
        var isNew = step.kind === "event" && previous && previousEventIds.indexOf(baseId(step.nodeId)) < 0;
        var isDivergence = isNew && !divergenceMarked;
        if (isDivergence) divergenceMarked = true;
        if (step.kind === "event") history.eventIds.push(baseId(step.nodeId));
        var record = recordOf(step.nodeId);
        if (step.kind === "event") history.cues.push({ beat: history.start + localBeat + 0.45, kind: "event", nodeId: step.nodeId, isNew: isNew, isDivergence: isDivergence });
        if (step.kind === "tech") history.cues.push({ beat: history.start + localBeat + 0.2, kind: "tech", nodeId: step.nodeId });
        if (step.kind === "decision") history.cues.push({ beat: history.start + localBeat + 0.45, kind: "decision" });
        if (step.kind === "ending") history.cues.push({ beat: history.start + localBeat + 0.5, kind: "ending", endingKey: record.node.endingKey });
        var caption;
        var categoryWord = { politics: " · politics", milestone: " · world milestone", forecast: " · forecast" }[record.node.category] || "";
        if (step.kind === "tech") {
          var parentNames = stepEdges.map(function (edgeId) { var parent = prologueNodeById[edgeId.split(">")[0]] || unionNode(edgeId.split(">")[0]); return parent ? titleCase(plainLabel(parent)) : ""; }).filter(Boolean);
          caption = {
            kicker: step.year + " · History " + (iterationIndex + 1) + " · technology reached",
            headline: plainLabel(record.node), body: record.node.note,
            meta: (step.holder ? "First reached by " + titleCase(step.holder) + ". " : "") + (parentNames.length ? "Builds on " + parentNames.join(", ") + "." : ""),
          };
        } else if (step.kind === "event") {
          caption = {
            kicker: step.year + " · History " + (iterationIndex + 1) + categoryWord + (isDivergence ? " · history diverges here" : isNew ? " · new in this history" : ""),
            headline: plainLabel(record.node), body: record.node.note, meta: "Fired in " + step.place + ". " + step.activation,
          };
        } else if (step.kind === "decision") {
          caption = { kicker: story.forkYear + " · History " + (iterationIndex + 1), headline: story.protagonist.name + " chooses: " + iteration.policyLabel, body: record.node.note, meta: samePast && previous.iteration.policyId !== iteration.policyId ? "Last time, " + story.protagonist.name + " chose " + previous.iteration.policyLabel.toLowerCase() + "." : "" };
        } else {
          var currentIds = history.eventIds;
          var addedCount = currentIds.filter(function (eventId) { return previousEventIds.indexOf(eventId) < 0; }).length;
          var goneNames = previousEventIds.filter(function (eventId) { return currentIds.indexOf(eventId) < 0; }).map(function (eventId) { return plainLabel(nodeById[eventId]); });
          if (goneNames.length > 8) goneNames = goneNames.slice(0, 8).concat(["and " + (goneNames.length - 8) + " more"]);
          caption = {
            kicker: step.year + " · The end of history " + (iterationIndex + 1),
            headline: titleCase(story.endings[iteration.ending].label),
            body: story.endings[iteration.ending].text,
            meta: previous ? addedCount + " new events since the last history" + (goneNames.length ? "; gone: " + goneNames.join(", ") : "") + ". Ending: " + titleCase(story.endings[previous.iteration.ending].label) + " → " + titleCase(story.endings[iteration.ending].label) + ". Your finale: " + record.node.finale + "." : "Your finale: " + record.node.finale + ".",
          };
        }
        history.steps.push({
          kind: step.kind, nodeId: step.nodeId, year: step.year, start: localBeat, length: stepLength, isNew: isNew, isDivergence: isDivergence,
          camera: null, relatedIds: stepEdges.map(function (edgeId) { return edgeId.split(">")[0]; }),
          caption: caption,
        });
        localBeat += stepLength;
      });
      history.cues.sort(function (first, second) { return first.beat - second.beat; });
      runningEndings[iteration.ending] = (runningEndings[iteration.ending] || 0) + 1;
      history.length = localBeat;
      beat += localBeat;
      histories.push(history);
      previous = history;
    });
    endingCountsBefore.push(Object.assign({}, runningEndings));
    totalBeats = beat;
  }

  // A history is laid out when it is first needed (and in the background); then its cameras, cue pitches and trace exist.
  function ensureLayout(history) {
    if (history.layout) return history;
    var layout = layoutHistory(history.iteration);
    history.layout = layout;
    function recordOf(nodeId) { return staticRecords[nodeId] || layout.records[nodeId]; }
    history.steps.forEach(function (step) {
      if (step.kind === "intro") return;
      var record = recordOf(step.nodeId);
      var relatedRecords = step.relatedIds.map(recordOf);
      step.camera = cameraOn(record.x, record.y, relatedRecords.concat([record]), step.kind === "ending" ? 1500 : step.kind === "tech" ? 1450 : 1250);
    });
    history.cues.forEach(function (cue) { if (cue.nodeId && recordOf(cue.nodeId)) cue.position = recordOf(cue.nodeId).x / WORLD_WIDTH; });
    history.steps.forEach(function (step) { if (step.kind === "ending") history.cues.forEach(function (cue) { if (cue.kind === "ending") cue.endingKey = recordOf(step.nodeId).node.endingKey; }); });
    buildTrace(history);
    return history;
  }
  var backgroundLayoutIndex = 0;
  function layOutInBackground() {
    var deadline = performance.now() + 30;
    while (backgroundLayoutIndex < histories.length && performance.now() < deadline) ensureLayout(histories[backgroundLayoutIndex++]);
    if (backgroundLayoutIndex < histories.length) setTimeout(layOutInBackground, 0);
    lastTraceCount = -1;
    if (totalBeats && !isPlaying) render(currentBeat);
  }

  // Each history's path, once it is over, stays as a faint trace: its arrows and a dot where each event fell.
  var traceElements = [];
  function buildTrace(history) {
    (function () {
      var inkPath = "";
      var redPath = "";
      history.layout.edges.forEach(function (routedEdge) { if (routedEdge.kind === "decision") redPath += routedEdge.pathData + " "; else inkPath += routedEdge.pathData + " "; });
      var dotPath = "";
      var endPath = "";
      Object.keys(history.layout.records).forEach(function (nodeId) {
        var record = history.layout.records[nodeId];
        if (record.node.kind === "ending") endPath += "M" + (record.x - 4).toFixed(1) + " " + (record.y - 30).toFixed(1) + " h8 v8 h-8 Z ";
        if (record.node.kind !== "event") return;
        dotPath += "M" + (record.x - 2.6).toFixed(1) + " " + (record.y - 5).toFixed(1) + " a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 ";
      });
      var group = createSvgElement("g", { "class": "trace" }, layers.traces);
      createSvgElement("path", { d: inkPath, fill: "none", stroke: INK_COLOR, "stroke-width": "0.6", opacity: "0.028" }, group);
      if (redPath) createSvgElement("path", { d: redPath, fill: "none", stroke: RED_COLOR, "stroke-width": "0.8", "stroke-dasharray": "6 5", opacity: "0.04" }, group);
      createSvgElement("path", { d: dotPath, fill: INK_COLOR, opacity: "0.09" }, group);
      createSvgElement("path", { d: endPath, fill: RED_COLOR, opacity: "0.35" }, group);
      group.style.display = "none";
      traceElements[history.index] = group;
    })();
  }

  // The live history and the one before it (fading out) are drawn; others exist only as traces.
  var drawnHistories = {};
  function drawHistory(history) {
    if (drawnHistories[history.index]) return drawnHistories[history.index];
    var nodeGroup = createSvgElement("g", { "class": "history-nodes" }, layers.liveNodes);
    var backingGroup = createSvgElement("g", { "class": "history-backings" }, layers.liveBackings);
    var edgeGroup = createSvgElement("g", { "class": "history-edges" }, layers.liveEdges);
    var drawn = { nodeGroup: nodeGroup, backingGroup: backingGroup, edgeGroup: edgeGroup, records: {}, edges: [] };
    Object.keys(history.layout.records).forEach(function (nodeId) {
      var layoutRecord = history.layout.records[nodeId];
      var drawing = buildNodeDrawing(layoutRecord.node, layoutRecord.mark, nodeGroup, backingGroup);
      var record = { node: layoutRecord.node, mark: layoutRecord.mark, group: drawing.group, x: layoutRecord.x, y: layoutRecord.y, extents: layoutRecord.extents };
      positionDrawing(record);
      attachHover(record.group, record.node, record.mark);
      drawn.records[nodeId] = record;
    });
    history.layout.edges.forEach(function (routedEdge) {
      var isRed = routedEdge.kind === "decision";
      var element = createSvgElement("path", { d: routedEdge.pathData, fill: "none", stroke: isRed ? RED_COLOR : INK_COLOR, "stroke-linecap": "round" }, edgeGroup);
      if (isRed) element.setAttribute("stroke-dasharray", "8 6");
      drawn.edges.push({ edge: routedEdge, element: element, length: element.getTotalLength(), isRed: isRed, isLineage: routedEdge.kind === "lineage" });
    });
    drawnHistories[history.index] = drawn;
    return drawn;
  }
  function keepDrawn(indexesToKeep) {
    Object.keys(drawnHistories).forEach(function (indexText) {
      if (indexesToKeep.indexOf(Number(indexText)) >= 0) return;
      var drawn = drawnHistories[indexText];
      [drawn.nodeGroup, drawn.backingGroup, drawn.edgeGroup].forEach(function (element) { element.parentNode.removeChild(element); });
      delete drawnHistories[indexText];
    });
  }

  // ── Rendering one moment ──────────────────────────────────────────────────
  var eventsPerSecond = 1.2;
  var overviewMode = true;
  var divergenceMark = null;
  var cursorLine = null;
  var cursorLabel = null;
  var lastCaptionKey = null;
  var lastTraceCount = -1;
  // QA: ?view=x,y,width fixes the overview camera on one region of the sheet.
  var requestedView = (function () {
    var viewText = new URLSearchParams(location.search).get("view");
    if (!viewText) return null;
    var viewNumbers = viewText.split(",").map(Number);
    return { x: viewNumbers[0], y: viewNumbers[1], width: viewNumbers[2], height: viewNumbers[2] * 0.6 };
  })();
  function easeInOut(progress) { return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; }
  function spanAt(beatPosition) {
    if (beatPosition < prologueSpan.length) return prologueSpan;
    var low = 0;
    var high = histories.length - 1;
    while (low < high) {
      var middle = Math.ceil((low + high) / 2);
      if (histories[middle].start <= beatPosition) low = middle; else high = middle - 1;
    }
    return histories[low];
  }
  function stepIndexAt(span, localBeat) {
    var found = 0;
    span.steps.forEach(function (step, stepIndex) { if (step.start <= localBeat) found = stepIndex; });
    return found;
  }
  function overviewCamera() {
    var width = Math.max(WORLD_WIDTH + 200, (WORLD_HEIGHT - headerTopPixels + 200) / stageAspect);
    return { x: WORLD_WIDTH / 2 - width / 2, y: headerTopPixels - 60, width: width, height: width * stageAspect };
  }
  function setCaption(key, caption) {
    if (key === lastCaptionKey) return;
    lastCaptionKey = key;
    document.getElementById("caption-kicker").textContent = caption.kicker;
    document.getElementById("caption-headline").textContent = caption.headline;
    document.getElementById("caption-body").textContent = caption.body;
    document.getElementById("caption-meta").textContent = caption.meta;
  }
  function renderTally(counts, currentEnding, historyCount) {
    var tallyElement = document.getElementById("tally");
    var keys = ["silicon_ascendancy", "corporate_dominion", "time", "panopticon_peace", "butlerian_accord", "great_collapse", "ousted"];
    var maximum = Math.max.apply(null, keys.map(function (key) { return counts[key] || 0; }).concat([1]));
    var html = '<div class="tally-title">Endings after ' + historyCount + " histor" + (historyCount === 1 ? "y" : "ies") + "</div>";
    keys.forEach(function (key) {
      var count = counts[key] || 0;
      html += '<div class="tally-row' + (key === currentEnding ? " current" : "") + '"><div>' + titleCase(story.endings[key].label) + '<div class="bar" style="width:' + Math.round(100 * count / maximum) + '%"></div></div><div>' + count + "</div></div>";
    });
    tallyElement.innerHTML = html;
  }
  function drawOn(edgeRecord, appearAt, localBeat, drawBeats, fadeOpacity) {
    var element = edgeRecord.element;
    var progress = appearAt === undefined ? 0 : Math.min(1, Math.max(0, (localBeat - appearAt) / drawBeats));
    if (progress <= 0 || fadeOpacity <= 0.001) { element.style.display = "none"; return; }
    element.style.display = "";
    element.setAttribute("opacity", (0.92 * fadeOpacity).toFixed(3));
    element.setAttribute("stroke-width", edgeRecord.isLineage ? "1.4" : "2.2");
    if (!edgeRecord.isRed) {
      element.setAttribute("stroke-dasharray", edgeRecord.length.toFixed(1) + " " + edgeRecord.length.toFixed(1));
      element.setAttribute("stroke-dashoffset", ((1 - progress) * edgeRecord.length).toFixed(1));
    }
    element.setAttribute("marker-end", progress >= 0.98 ? (edgeRecord.isLineage ? "url(#arrow-open)" : edgeRecord.isRed ? "url(#arrow-red)" : "url(#arrow-ink)") : "");
  }
  function setGroupOpacity(group, opacity) {
    var display = opacity <= 0.001 ? "none" : "";
    group.style.display = display;
    group.backing.style.display = display;
    group.setAttribute("opacity", opacity.toFixed(3));
    group.backing.setAttribute("opacity", opacity.toFixed(3));
  }

  function render(beatPosition) {
    var span = spanAt(beatPosition);
    var localBeat = beatPosition - span.start;
    var stepIndex = stepIndexAt(span, localBeat);
    var step = span.steps[stepIndex];
    var fadeBeats = Math.max(0.05, 0.45 * eventsPerSecond);
    var drawBeats = Math.max(0.08, 0.7 * eventsPerSecond);
    var isPrologue = !!span.isPrologue;
    var history = isPrologue ? null : ensureLayout(span);
    var historyIndex = isPrologue ? -1 : history.index;
    var endingReached = !isPrologue && step.kind === "ending" && localBeat >= step.start + 0.5;

    // Camera, always matching the window's shape.
    var camera;
    if (overviewMode) camera = requestedView || overviewCamera();
    else {
      var previousSpan = historyIndex > 0 ? ensureLayout(histories[historyIndex - 1]) : historyIndex === 0 ? prologueSpan : null;
      var fromCamera = stepIndex === 0 ? (previousSpan ? previousSpan.steps[previousSpan.steps.length - 1].camera : step.camera) : span.steps[stepIndex - 1].camera;
      var travelBeats = Math.min(step.length * 0.6, 1.1 * eventsPerSecond);
      var progress = easeInOut(Math.min(1, Math.max(0, (localBeat - step.start) / Math.max(0.01, travelBeats))));
      camera = {};
      ["x", "y", "width", "height"].forEach(function (keyName) { camera[keyName] = fromCamera[keyName] + (step.camera[keyName] - fromCamera[keyName]) * progress; });
    }
    var windowAspect = stageElement.clientHeight / Math.max(1, stageElement.clientWidth);
    var centreY = camera.y + camera.height / 2;
    camera = { x: camera.x, width: camera.width, height: camera.width * windowAspect, y: centreY - camera.width * windowAspect / 2 };
    stageElement.setAttribute("viewBox", camera.x.toFixed(1) + " " + camera.y.toFixed(1) + " " + camera.width.toFixed(1) + " " + camera.height.toFixed(1));

    // The real past: revealed during the prologue, then always on the sheet.
    var liveSourceIds = {};
    if (history) history.layout.edges.forEach(function (routedEdge) { if (staticRecords[routedEdge.from] && history.edgeAppear[routedEdge.id] !== undefined && localBeat >= history.edgeAppear[routedEdge.id]) liveSourceIds[routedEdge.from] = true; });
    Object.keys(staticRecords).forEach(function (nodeId) {
      var record = staticRecords[nodeId];
      var kind = record.node.kind;
      var opacity;
      if (kind === "decision" || kind === "ending") {
        opacity = isPrologue && !overviewMode ? 0.25 : 0.42;
        if (history && history.appear[nodeId] !== undefined && localBeat >= history.appear[nodeId]) opacity = Math.max(opacity, Math.min(1, (localBeat - history.appear[nodeId]) / fadeBeats));
        if (kind === "ending" && endingReached && history.iteration.ending === record.node.endingKey) opacity = 1;
      } else if (isPrologue && !overviewMode) {
        var appearAt = prologueSpan.appear[nodeId];
        opacity = appearAt !== undefined && localBeat >= appearAt ? Math.min(1, (localBeat - appearAt) / fadeBeats) : 0;
      } else {
        opacity = liveSourceIds[nodeId] ? 1 : 0.8;
      }
      setGroupOpacity(record.group, opacity);
      if (record.group.tallyElement) {
        var counts = overviewMode ? endingCountsBefore[endingCountsBefore.length - 1] : isPrologue ? {} : endingCountsBefore[historyIndex];
        var endingCount = (counts[record.node.endingKey] || 0) + (!overviewMode && endingReached && history.iteration.ending === record.node.endingKey ? 1 : 0);
        record.group.tallyElement.textContent = endingCount ? "× " + endingCount : "";
      }
    });
    staticEdgeRecords.forEach(function (edgeRecord) {
      if (isPrologue && !overviewMode) drawOn(edgeRecord, prologueSpan.appear[edgeRecord.edge.to] === undefined ? undefined : prologueSpan.appear[edgeRecord.edge.to] - 0.15, localBeat, drawBeats, 1);
      else {
        edgeRecord.element.style.display = "";
        edgeRecord.element.setAttribute("opacity", "0.55");
        edgeRecord.element.setAttribute("stroke-width", edgeRecord.isLineage ? "0.9" : "1.2");
        edgeRecord.element.removeAttribute("stroke-dasharray");
        edgeRecord.element.removeAttribute("stroke-dashoffset");
        edgeRecord.element.setAttribute("marker-end", edgeRecord.isLineage ? "url(#arrow-open)" : "url(#arrow-ink)");
      }
    });

    // Traces of every history that has already been played.
    var traceCount = overviewMode ? histories.length : Math.max(0, historyIndex);
    if (traceCount !== lastTraceCount) {
      traceElements.forEach(function (traceElement, traceIndex) { if (traceElement) traceElement.style.display = traceIndex < traceCount ? "" : "none"; });
      lastTraceCount = traceCount;
    }

    // The live history in full ink; the one before fades out while the next begins.
    var keep = [];
    if (!overviewMode && history) {
      keep.push(historyIndex);
      var liveDrawn = drawHistory(history);
      Object.keys(liveDrawn.records).forEach(function (nodeId) {
        var record = liveDrawn.records[nodeId];
        var appearAt = history.appear[nodeId];
        setGroupOpacity(record.group, appearAt !== undefined && localBeat >= appearAt ? Math.min(1, (localBeat - appearAt) / fadeBeats) : 0);
        if (record.group.newTag) {
          var thisStep = null;
          history.steps.forEach(function (candidate) { if (candidate.nodeId === nodeId) thisStep = candidate; });
          record.group.newTag.style.display = thisStep && thisStep.isNew && appearAt !== undefined && localBeat >= appearAt ? "" : "none";
        }
      });
      liveDrawn.edges.forEach(function (edgeRecord) { drawOn(edgeRecord, history.edgeAppear[edgeRecord.edge.id], localBeat, drawBeats, 1); });
      if (historyIndex > 0 && localBeat < 1.2) {
        keep.push(historyIndex - 1);
        var fadingHistory = histories[historyIndex - 1];
        var fadingDrawn = drawHistory(fadingHistory);
        var fadeOpacity = Math.max(0, 1 - localBeat / 1.0);
        Object.keys(fadingDrawn.records).forEach(function (nodeId) {
          setGroupOpacity(fadingDrawn.records[nodeId].group, fadeOpacity);
          if (fadingDrawn.records[nodeId].group.newTag) fadingDrawn.records[nodeId].group.newTag.style.display = "none";
        });
        fadingDrawn.edges.forEach(function (edgeRecord) { drawOn(edgeRecord, -1, 1, 1, fadeOpacity); });
      }
    }
    keepDrawn(keep);

    // The divergence mark sits above the first event this history did not share with the last one.
    var divergenceStep = null;
    if (!overviewMode && history) history.steps.forEach(function (candidate) { if (candidate.isDivergence) divergenceStep = candidate; });
    var showDivergence = divergenceStep && history.appear[divergenceStep.nodeId] <= localBeat;
    divergenceMark.style.display = showDivergence ? "" : "none";
    if (showDivergence) {
      var divergenceRecord = drawnHistories[historyIndex].records[divergenceStep.nodeId];
      divergenceMark.setAttribute("transform", "translate(" + divergenceRecord.x.toFixed(1) + " " + (divergenceRecord.y + divergenceRecord.extents.top - 12).toFixed(1) + ")");
    }

    // The cursor runs along the year being told; on this sheet that is exactly where the event sits.
    var showCursor = !overviewMode && (step.kind === "event" || step.kind === "decision" || step.kind === "tech" || step.kind === "ending");
    cursorLine.style.display = showCursor ? "" : "none";
    cursorLabel.style.display = showCursor ? "" : "none";
    if (showCursor) {
      var cursorRecord = staticRecords[step.nodeId] || drawnHistories[historyIndex].records[step.nodeId];
      var cursorY = cursorRecord.y - 26;
      cursorLine.setAttribute("x1", 70); cursorLine.setAttribute("x2", WORLD_WIDTH - 70);
      cursorLine.setAttribute("y1", cursorY); cursorLine.setAttribute("y2", cursorY);
      cursorLabel.setAttribute("x", Math.min(WORLD_WIDTH - 80, camera.x + camera.width - 30)); cursorLabel.setAttribute("y", cursorY - 9);
      cursorLabel.textContent = String(step.year);
    }
    bandGroup.setAttribute("opacity", overviewMode ? "1" : "0");

    if (overviewMode) {
      renderTally(endingCountsBefore[endingCountsBefore.length - 1], null, histories.length);
      setCaption("overview", { kicker: "Futures charted after Alfred H. Barr, Jr., 1936", headline: "The real past, " + histories.length + " futures", body: "At the top, what has already happened: real technologies and the events they made possible. From " + FUTURE_START_YEAR + ", " + histories.length + " futures played by the game's engine, each drawn at the years it happened. Here they are all overlaid as faint traces.", meta: "Press Play to watch the past, then each future unfold in turn." });
      document.getElementById("clock").textContent = "All " + histories.length + " histories";
    } else if (isPrologue) {
      renderTally({}, null, 0);
      setCaption("prologue:" + stepIndex, step.caption);
      document.getElementById("clock").textContent = "The real past" + (step.year ? " · " + step.year : "");
    } else {
      var liveCounts = Object.assign({}, endingCountsBefore[historyIndex]);
      if (endingReached) liveCounts[history.iteration.ending] = (liveCounts[history.iteration.ending] || 0) + 1;
      renderTally(liveCounts, endingReached ? history.iteration.ending : null, historyIndex + (endingReached ? 1 : 0));
      setCaption(historyIndex + ":" + stepIndex, step.caption);
      document.getElementById("clock").textContent = "History " + (historyIndex + 1) + " / " + histories.length + (step.year ? " · " + step.year : "");
    }
  }

  // ── Playback: loops forever ───────────────────────────────────────────────
  var currentBeat = 0;
  var isPlaying = false;
  var lastFrameStamp = null;
  var scrubber = document.getElementById("scrubber");
  var playButton = document.getElementById("play-button");
  var overlay = document.getElementById("play-overlay");
  var paceInput = document.getElementById("pace");
  var paceOutput = document.getElementById("pace-value");

  function setBeat(beatPosition) {
    currentBeat = ((beatPosition % totalBeats) + totalBeats) % totalBeats;
    scrubber.value = String(Math.round(10000 * currentBeat / totalBeats));
    render(currentBeat);
  }
  // Sounds play only while the sequence plays forward, for the cues crossed since the last frame.
  function spansBetween(fromBeat, toBeat) {
    var all = [prologueSpan].concat(histories);
    return all.filter(function (span) { return span.start + span.length > fromBeat && span.start <= toBeat; });
  }
  function cuesBetween(fromBeat, toBeat) {
    var crossed = [];
    spansBetween(fromBeat, toBeat).forEach(function (span) {
      span.cues.forEach(function (cue) { if (cue.beat > fromBeat && cue.beat <= toBeat) crossed.push(cue); });
    });
    return crossed;
  }
  function playCues(fromBeat, toBeat) {
    if (!window.HistorySound || !window.HistorySound.isEnabled()) return;
    var crossed = toBeat >= fromBeat ? cuesBetween(fromBeat, toBeat) : cuesBetween(fromBeat, totalBeats).concat(cuesBetween(-1, toBeat));
    crossed.slice(-6).forEach(function (cue) {
      if (cue.position === undefined && cue.kind !== "decision" && cue.kind !== "ending") return;
      var delaySeconds = Math.max(0, (cue.beat - fromBeat) / Math.max(0.05, eventsPerSecond)) * 0.25;
      if (cue.kind === "tech") window.HistorySound.technology(cue.position, delaySeconds);
      else if (cue.kind === "event") window.HistorySound.event(cue.position, { isNew: cue.isNew, isDivergence: cue.isDivergence }, delaySeconds);
      else if (cue.kind === "decision") window.HistorySound.decision(delaySeconds);
      else if (cue.kind === "ending") window.HistorySound.ending(cue.endingKey, delaySeconds);
    });
  }
  function frame(stamp) {
    if (!isPlaying) return;
    if (lastFrameStamp !== null) {
      var beatBefore = currentBeat;
      setBeat(currentBeat + eventsPerSecond * Math.min(0.25, (stamp - lastFrameStamp) / 1000));
      playCues(beatBefore, currentBeat);
    }
    lastFrameStamp = stamp;
    requestAnimationFrame(frame);
  }
  function leaveOverview() { if (overviewMode) { overviewMode = false; overlay.hidden = true; } }
  function play() {
    if (window.HistorySound) window.HistorySound.unlock();
    leaveOverview();
    isPlaying = true;
    lastFrameStamp = null;
    playButton.textContent = "Pause";
    requestAnimationFrame(frame);
  }
  function pause() { isPlaying = false; playButton.textContent = "Play"; }
  function jumpHistory(direction) {
    leaveOverview();
    var span = spanAt(currentBeat);
    var currentIndex = span.isPrologue ? -1 : span.index;
    var targetIndex = currentIndex + direction;
    if (targetIndex < -1) targetIndex = histories.length - 1;
    if (targetIndex >= histories.length) targetIndex = -1;
    setBeat(targetIndex === -1 ? 0.001 : histories[targetIndex].start + 0.001);
  }

  // Panels float over the sheet; one button (or H) shows or hides them all. The choice is remembered per viewer.
  var panelToggle = document.getElementById("ui-toggle");
  function setPanelsHidden(hidden) {
    document.body.classList.toggle("ui-hidden", hidden);
    panelToggle.textContent = hidden ? "Show panels" : "Hide panels";
    panelToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
    try { localStorage.setItem("history-pathways-panels-hidden", hidden ? "1" : "0"); } catch (storageError) { /* storage unavailable: the choice lasts this visit only */ }
  }
  panelToggle.addEventListener("click", function () { setPanelsHidden(!document.body.classList.contains("ui-hidden")); });
  // Panels start hidden unless this viewer chose to show them last time.
  var storedPanelsChoice = null;
  try { storedPanelsChoice = localStorage.getItem("history-pathways-panels-hidden"); } catch (storageError) { /* default: panels hidden */ }
  setPanelsHidden(storedPanelsChoice !== "0");
  // ?panels=shown opens with the panels shown; ?panels=hidden forces them off.
  var panelsParameter = new URLSearchParams(location.search).get("panels");
  if (panelsParameter === "hidden" || panelsParameter === "shown") setPanelsHidden(panelsParameter === "hidden");
  window.addEventListener("resize", function () {
    stageAspect = stageElement.clientHeight / Math.max(1, stageElement.clientWidth);
    if (totalBeats) render(currentBeat);
  });

  // Sound on or off, beside the panel button so it stays reachable while the panels are hidden (or the M key).
  var soundToggle = document.getElementById("sound-toggle");
  function setSoundEnabled(isEnabled) {
    if (!window.HistorySound) return;
    window.HistorySound.setEnabled(isEnabled);
    soundToggle.textContent = isEnabled ? "Sound on" : "Sound off";
    soundToggle.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  }
  if (window.HistorySound) setSoundEnabled(window.HistorySound.isEnabled()); else soundToggle.hidden = true;
  soundToggle.addEventListener("click", function () { setSoundEnabled(!window.HistorySound.isEnabled()); });

  function updatePace() {
    eventsPerSecond = Number(paceInput.value);
    paceOutput.textContent = eventsPerSecond.toFixed(1) + " events/s";
  }

  playButton.addEventListener("click", function () { if (isPlaying) pause(); else play(); });
  document.getElementById("play-big").addEventListener("click", function () { setBeat(0); play(); });
  document.getElementById("previous-button").addEventListener("click", function () { jumpHistory(-1); });
  document.getElementById("next-button").addEventListener("click", function () { jumpHistory(1); });
  scrubber.addEventListener("input", function () { leaveOverview(); pause(); setBeat(totalBeats * Number(scrubber.value) / 10000); });
  paceInput.addEventListener("input", updatePace);
  document.addEventListener("keydown", function (keyEvent) {
    var plainKey = !keyEvent.ctrlKey && !keyEvent.metaKey && !keyEvent.altKey && keyEvent.target.tagName !== "INPUT";
    if (keyEvent.code === "Space" && keyEvent.target === document.body) { keyEvent.preventDefault(); if (isPlaying) pause(); else play(); }
    if (keyEvent.code === "KeyM" && plainKey) setSoundEnabled(!window.HistorySound.isEnabled());
    if (keyEvent.code === "KeyH" && plainKey) setPanelsHidden(!document.body.classList.contains("ui-hidden"));
  });

  // Hovering a name while paused explains it.
  function attachHover(group, node, mark) {
    group.style.cursor = "help";
    group.addEventListener("mouseenter", function () {
      if (isPlaying) return;
      var kindName = node.kind === "tech" ? "Technology" : node.kind === "decision" ? "Decision" : node.kind === "ending" ? "Ending" : "Event";
      var isReal = !!prologueNodeById[node.id];
      var lineageText = "";
      if (node.kind === "tech") {
        var buildsOn = lineageEdges.concat(prologue.edges.filter(function (edge) { return edge.kind === "lineage"; })).filter(function (edge) { return edge.to === node.id; })
          .map(function (edge) { var parent = prologueNodeById[edge.from] || nodeById[edge.from]; return parent ? titleCase(plainLabel(parent)) : ""; }).filter(Boolean);
        if (buildsOn.length) lineageText = "Builds on " + buildsOn.join(", ") + ". ";
      }
      setCaption("hover:" + node.id, {
        kicker: (isReal ? "The real past · " : "") + kindName + (mark && mark.when ? " · " + mark.when : ""),
        headline: plainLabel(node), body: node.note || "",
        meta: lineageText + (isReal ? "" : (node.detail || "") + (node.uses ? " Part of " + node.uses + " of " + histories.length + " simulated histories." : "")),
      });
    });
    group.addEventListener("mouseleave", function () { lastCaptionKey = null; render(currentBeat); });
  }

  function start() {
    while (stageElement.lastChild && stageElement.lastChild.nodeName !== "title") stageElement.removeChild(stageElement.lastChild);
    ["paper", "axes", "traces", "cursor", "staticLineage", "staticEdges", "liveEdges", "staticBackings", "liveBackings", "staticNodes", "liveNodes", "marks", "measure"].forEach(function (layerName) {
      layers[layerName] = createSvgElement("g", { "class": "layer-" + layerName }, stageElement);
    });
    layers.measure.setAttribute("opacity", "0");
    measureLayer = layers.measure;
    drawPaper(layers);
    layoutStaticSheet();
    drawAxes(layers);
    buildBand(layers);
    Object.keys(staticRecords).forEach(function (nodeId) { attachHover(staticRecords[nodeId].group, staticRecords[nodeId].node, staticRecords[nodeId].mark); });
    cursorLine = createSvgElement("line", { stroke: RED_COLOR, "stroke-width": "1.6", opacity: "0.55" }, layers.cursor);
    cursorLabel = addText(layers.cursor, "", { "text-anchor": "end", "font-family": FONT_FAMILY, "font-size": "20", "font-weight": "600", fill: RED_COLOR, "letter-spacing": "1.5" }, true);
    divergenceMark = createSvgElement("g", {}, layers.marks);
    createSvgElement("path", { d: "M-7 -6 L7 -6 L0 3 Z", fill: RED_COLOR }, divergenceMark);
    addText(divergenceMark, "HISTORY DIVERGES HERE", { x: 0, y: -12, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": "13", "font-weight": "600", "letter-spacing": "2", fill: RED_COLOR }, true);
    buildHistories();
    updatePace();
    document.getElementById("masthead-text").textContent = "The real past to " + (FUTURE_START_YEAR - 1) + ", then " + story.iterations.length + " simulated futures, each drawn at the years it happened, on one sheet after Alfred H. Barr, Jr.'s 1936 chart.";
    document.getElementById("footnote").textContent = "Above the red " + FUTURE_START_YEAR + " line is the real past: real technologies at the year they first appeared, with who made them, and real events. Below it, every history is a full game from the simulation's engine (" + FUTURE_START_YEAR + "–2085), with " + story.protagonist.name + " as the protagonist and a policy chosen at " + story.forkYear + ". Each history's events sit at the year they happened in that history; when it ends, its path stays as a faint trace. The strip just below the line holds technologies the game gives actors at the start. The first five histories share one past and differ only in " + story.protagonist.name + "'s choice; the rest mix new seeds and re-rolled dice. The sequence loops.";
    var params = new URLSearchParams(location.search);
    var requestedPosition = params.get("at");
    if (requestedPosition !== null) { leaveOverview(); setBeat(Number(requestedPosition) * totalBeats); }
    else setBeat(0);
    setTimeout(layOutInBackground, 50);
  }

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(start);
})();
