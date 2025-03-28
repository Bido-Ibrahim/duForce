import * as PIXI from 'pixi.js'
//import { Cull } from "@pixi-essentials/cull";
import { Viewport } from "pixi-viewport";
import * as d3 from "d3";
import { bfsFromNode } from "graphology-traversal";
import { dijkstra } from "graphology-shortest-path";
import Graph from "graphology";
import Fuse from 'fuse.js'
import { config } from "./config";
import { COLOR_SCALE_RANGE } from "./constants";
import { drawTree, getColorScale } from "./tree";

let previousNodes = [];
export default async function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector, // id or class selector of DIV to render the graph in
    initial = true,
    nodeId = "id", // given d in nodes, returns a unique identifier (string)
    sourceId = "source", // given d in links, returns a uinique source node identifier (string)
    targetId = "target", // given d in links, returns a uinique target node identifier (string)
    nodeGroup, // given d in nodes, returns an (ordinal) value for color
    nodeGroups, // an array of ordinal values representing the node groups
    nodeRadius,
    nodeTitle, // given d in nodes, a title string
    nodeFill = "0xFFFFFF", // node stroke fill (if not using a group color encoding)
    nodeStroke = "0xFFFFFF", // node stroke color
    nodeStrokeWidth = 0.5, // node stroke width, in pixels
    nodeFillOpacity = 1, // node stroke opacity
    nodeStrokeOpacity = 1, // node stroke opacity
    nodeMinSize = 6, // node radius, in pixels
    linkStroke = "0xFFFFFF", // link stroke color
    linkStrokeOpacity = 1, // link stroke opacity
    linkStrokeWidth = 0.5, // given d in links, returns a stroke width in pixels
    //labelVisibility = "hidden",
    labelColor = "white",
    labelScale = 2, // the font size of labels are pegged to the node radius. if labelScale = 1, the font size is the same number of pixels as the radius. Increase labelScale to increase font size.
    colors = d3.schemeTableau10, // an array of color strings, for the node groups
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels
    tooltipStyles = {
      width: "300px",
      height: "auto",
      "max-height": "300px",
      "overflow-y": "auto",
      padding: "10px",
      "background-color": "white",
      border: "1px solid black",
      "z-index": 10,
    },
    tooltipExtraStyles = {
      width: "100px",
      height: "auto",
      padding: "2px",
      "background-color": "white",
      border: "0.5px solid black",
      color: "black",
      "font-size":"12",
      "z-index": 30,
    },
  } = {}
) {
  console.log("received data", nodes, links);
 if(!nodes) return

  let expandedAll = nodes.length === config.selectedNodeNames.length;
  let TOOLTIP_KEYS = ['NAME', "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"]
  // Button activation states
  // Note: there are different consequences for a VIEW state and BUTTON ACTIVATION state, so these variables are separated)
  let currentLayout = config.currentLayout;

  // Set up accessors to enable a cleaner way of accessing data attributes
  const N = d3.map(nodes, (d) => d[nodeId]).map(intern);
  const LS = d3.map(links, (d) => d[sourceId]).map(intern);
  const LT = d3.map(links, (d) => d[targetId]).map(intern);

  // Replace the input nodes and links with mutable objects for the simulation
  nodes = d3.map(nodes, (d, i) => ({ id: N[i], ...d, type: "tier3" })); // tier3 indicates theses are VARIABLE nodes
  links = d3.map(links, (_, i) => ({
    source: LS[i],
    target: LT[i],
  }));

  const getLinkId = (link, type) => {
    if(typeof link[type] === "object") return link[type].id;
    return link[type];
  }

  // cleaner mapping of nodeDegrees and singleNodeIDs
  const nodeDegrees = nodes.reduce((acc, node) => {
    const sourceLinks = links.filter((f) => getLinkId(f,"source") === node.id).length;
    const targetLinks = links.filter((f) => getLinkId(f,"target") === node.id).length;
    acc[node.id] = sourceLinks + targetLinks;
    return acc;
  },{})
  const singleNodeIDs = Object.keys(nodeDegrees).filter((f) => nodeDegrees[f] === 0);
  // saving all nodes and links - may add filtering back later but works in conjunction with list
  const showEle = {nodes, links};

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain(nodeRadius ? d3.extent(nodes, nodeRadius) : [0, d3.max(Object.values(nodeDegrees))])
    .range([nodeMinSize, nodeMinSize * 3])
    .clamp(true);

  /////////////////// Set up initial  DOM elements on screen ///////////////////
  // Create a container for tooltip that is only visible on mouseover of a node
  let tooltip = d3.select(containerSelector).select(".tooltip");
  if(tooltip.node() === null){
    tooltip = d3.select(containerSelector).append("div").attr("class", "tooltip").style("position", "absolute").style("visibility", "hidden");
  }
  let tooltipExtra = d3.select(containerSelector).select(".tooltipExtra");
  if(tooltipExtra.node() === null){
    tooltipExtra = d3.select(containerSelector).append("div").attr("class", "tooltipExtra").style("position", "absolute").style("visibility", "hidden");
  }

  for (const prop in tooltipStyles) {
    tooltip.style(prop, tooltipStyles[prop]);
    tooltipExtra.style(prop, tooltipExtraStyles[prop]);
  }

  d3.selectAll(".tooltip")
    .on('wheel', function(event) {
      event.stopPropagation(); // Prevent the scroll event from affecting other elements
    });
  d3.selectAll(".tooltipExtra")
    .on('wheel', function(event) {
      event.stopPropagation(); // Prevent the scroll event from affecting other elements
    });




  // Initialize simulation
  const simulation = d3
    .forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id))
    .force("x", d3.forceX((d) => d.x))
    .force("y", d3.forceY((d) => d.y))
    .force("collide", d3.forceCollide()
        .radius((d) => (d.type === "tier1" || d.type === "tier2" ? d.radius * 2 : d.radius))
        .iterations(3)
    )
    .force("cluster", forceCluster().strength(0.45)) // cluster all nodes belonging to the same submodule.

  simulation.stop();

  // Create PIXI application
  const app = new PIXI.Application({
    width,
    height,
    resolution: 2,
    transparent: true,
    antialias: true,
    autoDensity: true,
    autoStart: true,
  });

  // Add the view to the DOM
  document.querySelector(containerSelector).appendChild(app.view);

  // create PIXI viewport
  const viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth: width,
    worldHeight: height,
    events: app.renderer.events,
  });
  // Enable interaction of the canvas
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // Interactivity with the canvas itself
  const dragEnd = () => {
    app.stage.off("pointermove");
    viewport.pause = false;
  };
  app.stage.on("pointerup", dragEnd);
  app.stage.on("pointerupoutside", dragEnd);

  app.stage.addChild(viewport);

  viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.2, maxScale: 5 });
  // To shift the graph to the middle of the screen, because d3 force simulation naturally renders graph with start position at (0,0)
  viewport.center = new PIXI.Point(0, 0);

  const circleGraphics = new PIXI.Graphics();
  circleGraphics.beginFill(nodeFill);
  circleGraphics.lineStyle(nodeStrokeWidth, nodeStroke, nodeStrokeOpacity);
  circleGraphics.drawCircle(0, 0, 44);
  const circleTexture = app.renderer.generateTexture(circleGraphics, {
    resolution: 2,
  });

  const triangle = new PIXI.Graphics();
  let triangleWidth = 12;
  triangle.beginFill("#A0A0A0", 1);
  triangle.lineStyle(0, "#A0A0A0", 1);
  triangle.moveTo(-triangleWidth, 0);
  triangle.lineTo(triangleWidth, triangleWidth);
  triangle.lineTo(triangleWidth, -triangleWidth);
  triangle.endFill();
  const triangleTexture = app.renderer.generateTexture(triangle, {
    resolution: 2,
  });

  const linksLayer = new PIXI.Container();
  viewport.addChild(linksLayer);
  const nodesLayer = new PIXI.Container();
  viewport.addChild(nodesLayer);
  const labelsLayer = new PIXI.Container();
  viewport.addChild(labelsLayer);

  // To store state/data of Pixi.JS graphics
  let nodeDataToNodeGfx = new WeakMap();
  let nodeGfxToNodeData = new WeakMap();
  let nodeDataToLabelGfx = new WeakMap();
  let labelGfxToNodeData = new WeakMap();
  let linkDataToLinkGfx = new WeakMap();
  let linkGfxToLinkData = new WeakMap();

  update(true);

  /////////////////////// SIMULATION-RELATED FUNCTIONS /////////////////////////
  function update() {
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS
    const uniqueLinks = [];
    const uniqueLinksSet = new Set();
    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      if (Object.keys(link).length === 0) continue;
      const linkStr = `${getSourceId(link)}-${getTargetId(link)}`;
      if (!uniqueLinksSet.has(linkStr) && getSourceId(link) !== getTargetId(link)) {
        uniqueLinksSet.add(linkStr);
        uniqueLinks.push(link);
      }
    }
    showEle.links = uniqueLinks;

    // Set up accessors to enable a cleaner way of accessing attributes of each node and edge
    const T = nodeTitle === undefined ? d3.map(showEle.nodes, (d) => d.NAME).map(intern) : d3.map(showEle.nodes, nodeTitle).map(intern);
    const G = nodeGroup == null ? null : d3.map(showEle.nodes, nodeGroup).map(intern);
    const W = typeof linkStrokeWidth !== "function" ? null : d3.map(showEle.links, linkStrokeWidth);
    const L = typeof linkStroke !== "function" ? null : d3.map(showEle.links, linkStroke);
    if (G && nodeGroups === undefined) nodeGroups = d3.sort(G);
    const color = getColorScale();

    for (let i = 0; i < showEle.nodes.length; i++) {
      let node = showEle.nodes[i];
      node.linkCnt = nodeDegrees[node.id] || 0;
      node.color = G ? color(G[i]) : nodeFill;
      node.radius = nodeRadiusScale(node.linkCnt);
    }

    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      link.linkStroke = L ? L[i] : linkStroke;
      link.linkStrokeWidth = W ? W[i] : linkStrokeWidth;
    }
    console.log("elements on screen", showEle);
    // Stores graph in a Graphology object just for the shortest path and nearest neighbour calculations
    const graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const updateVisibility = () => {
      // Purpose of culling is to only render 'in-screen' objects for performance optimization
      // const cull = new Cull();
      // cull.addAll(nodesLayer.children);
      // cull.addAll(labelsLayer.children);
      // cull.addAll(linksLayer.children);
      // cull.cull(app.renderer.screen);

      const zoom = viewport.scale.x;
      const zoomSteps = [1, 2, 3, Infinity];
      const zoomStep = zoomSteps.findIndex((zoomStep) => zoom <= zoomStep);

      for (let i = 0; i < showEle.nodes.length; i++) {
        const labelGfx = nodeDataToLabelGfx.get(showEle.nodes[i]);
        labelGfx.visible = showEle.nodes[i].type === "tier1" || showEle.nodes[i].type === "tier2" ? 1 : zoomStep >= 3;
      }
    };




    /*
     * Create a map of node data and the node graphics.
     * - Create a node container to hold the graphics
     * - Create circle, border and text Sprites using the created texture
     * - Add the sprites to the container
     * - Add event listeners to the container to handle interactions
     */
    let nodeDataGfxPairs = [];
    for (let i = 0; i < nodes.length; i++) {
      let nodeData = nodes[i];
      let nodeGfx = nodeDataToNodeGfx.get(nodeData);
      let labelGfx = nodeDataToLabelGfx.get(nodeData);

      // If the node is collapsed into parent, remove it from the node and label group container
      if (showEle.nodes.findIndex((n) => n.id === nodeData.id) === -1) {
        if (nodeGfx) {
          nodesLayer.removeChild(nodeGfx);
        }
        if (labelGfx) {
          labelsLayer.removeChild(labelGfx);
        }
      } else {
        // If node is to be rendered, check if the container storing that node exists already. If not, create each node and label container.
        if (!nodeGfx) {
          nodeGfx = new PIXI.Container();
          nodeGfx.name = nodeData.id;
          nodeGfx.cursor = "pointer";
          nodeGfx.hitArea = new PIXI.Circle(0, 0, nodeData.radius + 2);
          nodeGfx.eventMode = "static";
          nodeGfx.x = nodeData.x;
          nodeGfx.y = nodeData.y
          // Because the click event still gets triggered after mouse is released from a node drag (pointerup event), create 2 types of pointerdown events to prevent interference
          nodeGfx.on("pointerdown", (event) => {
            const node = nodeGfxToNodeData.get(event.currentTarget);
            node.pointerdown = true;
            node.clicked = true;
          })
          nodeGfx.on("pointermove", (event) => {
            const node = nodeGfxToNodeData.get(event.currentTarget);
            if(node.pointerdown){
              // need to find links
              viewport.pause = true;
              node.clicked = false;
              const actualPoints = viewport.toWorld(event.global);
              event.currentTarget.x = actualPoints.x;
              event.currentTarget.y = actualPoints.y;
              const fakeNode = {radius: node.radius, x: actualPoints.x, y: actualPoints.y};
              graph.forEachEdge(node.id, (edgeId, attributes, source, target) => {
                const link = showEle.links.find((f) => f.source.id === source && f.target.id === target);
                const chartLink = linkDataToLinkGfx.get(link);
                const sourceNode = source === node.id ? fakeNode : showEle.nodes.find((f) => f.id === source);
                const targetNode = target === node.id ? fakeNode : showEle.nodes.find((f) => f.id === target);
                const linkAlpha = getLinkAlpha(link, showEle.links.length);
                updateLink(chartLink, sourceNode, targetNode, linkAlpha)
              });

            }
          })
          nodeGfx.on("pointerup", (event) => {
            const node = nodeGfxToNodeData.get(event.currentTarget);
            node.pointerdown = false;
            if(parseInt(node.x) !== parseInt(event.currentTarget.x)){
              node.x = event.currentTarget.x;
              node.y = event.currentTarget.y;
              updatePositions();
            }
            if(node.clicked){
              clickNode(node.NAME);
            }
          })
          nodeGfx.on("mouseover", (event) => updateTooltip(nodeGfxToNodeData.get(event.currentTarget),true, event.x));
          nodeGfx.on("mouseout", () => {
            if(expandedAll){
              tooltip.style("visibility", "hidden");
            } else {
              const singleNode = config.selectedNodeNames.length === 1;
              // passing in single node if only one selected - undefined otherwise as unused
              const tooltipNode = singleNode ? showEle.nodes.find((f) => f.NAME === config.selectedNodeNames[0]) : undefined;
              updateTooltip(tooltipNode,false)
            }
          });

          const circle = new PIXI.Sprite(circleTexture);
          circle.name = "CIRCLE";
          circle.x = -nodeData.radius;
          circle.y = -nodeData.radius;
          circle.tint = nodeData.color;
          circle.alpha = nodeFillOpacity;
          circle.width = nodeData.radius * 2;
          circle.height = nodeData.radius * 2;

          nodeGfx.addChild(circle);
          nodesLayer.addChild(nodeGfx);
        }

        if (!labelGfx) {
          labelGfx = new PIXI.Container();
          labelGfx.visible = nodeData.type === "tier1" || nodeData.type === "tier2" ? true : false;

          const textStyle = new PIXI.TextStyle({
            fontFamily: "Lato",
            fontSize: 8,
            align: "left",
            fill: labelColor,
          });

          const label = new PIXI.Text(nodeData.NAME, textStyle);
          label.name = "LABEL";

          // position label to the right of node
          //label.x = nodeData.radius + 3;
          //label.y = -nodeData.radius * 1.05;

          // position label at the middle of node
          const textMetrics = PIXI.TextMetrics.measureText(nodeData.NAME, textStyle)
          label.x = -textMetrics.width/4
          label.y = nodeData.radius - 0.5;

          // adjust node position on a per node basis
          //label.x = nodeData.type === "tier1" ? -textMetrics.width/4 : nodeData.radius + 3
          //label.y = nodeData.type === "tier1" ? -textMetrics.height/4 : -nodeData.radius * 1.05

          label.resolution = 2;
          label.scale.set(0.5);

          labelGfx.addChild(label);
          labelsLayer.addChild(labelGfx);
        }

        nodeDataGfxPairs.push([nodeData, nodeGfx, labelGfx]);
      }
    }

    /*
     * Create a map of link data and the link graphics.
     * - Create a link container to hold the grahics
     * - Create line Sprite and add it to the container
     */
    linksLayer.removeChildren();

    let linkDataGfxPairs = [];
    for (let i = 0; i < showEle.links.length; i++) {
      let linkData = showEle.links[i];
      const lineSize = linkData.linkStrokeWidth;
      const sourceNodeData = showEle.nodes.find((n) => n.id === getTargetId(linkData));

      const linkGfx = new PIXI.Container();
      linkGfx.name = getSourceId(linkData) + "-" + getTargetId(linkData);
      linkGfx.pivot.set(0, lineSize / 2);
      //linkGfx.alpha = showEle.links.length > 200 ? 0.3 : linkStrokeOpacity;

      const line = new PIXI.Sprite(PIXI.Texture.WHITE);
      line.name = "LINE";
      line.x = sourceNodeData ? sourceNodeData.radius : 0;
      line.y = -lineSize / 2;
      line.height = lineSize;

      linkGfx.addChild(line);

      const arrow = new PIXI.Sprite(triangleTexture);
      arrow.name = "ARROW";
      arrow.x = sourceNodeData ? sourceNodeData.radius : 0;
      arrow.y = -1.5;
      arrow.width = 3;
      arrow.height = 3;
      arrow.alpha = config.showArrows ? 1 : 0;
      linkGfx.addChild(arrow);

      linksLayer.addChild(linkGfx);

      linkDataGfxPairs.push([linkData, linkGfx]);
    }

    // Create lookup tables
    nodeDataToNodeGfx = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeData, nodeGfx]));
    nodeGfxToNodeData = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeGfx, nodeData]));
    nodeDataToLabelGfx = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeData, labelGfx]));
    labelGfxToNodeData = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [labelGfx, nodeData]));
    linkDataToLinkGfx = new WeakMap(linkDataGfxPairs.map(([linkData, linkGfx]) => [linkData, linkGfx]));
    linkGfxToLinkData = new WeakMap(linkDataGfxPairs.map(([linkData, linkGfx]) => [linkGfx, linkData]));


    // Reheat the force layout only for the new graph state after collapse/expand, prevent unnecessary movment of elements on screen
    if (!initial) {
     // no need to reset - other layouts will be different
      // might want to rethink this if we end up filtering and/or highlighting
     // simulation.stop();
    //  simulation.nodes([]).force("link").links([]);
    //  simulation.nodes(showEle.nodes).force("link").links(showEle.links);
    //  simulation.alphaTarget(0.1).restart();
    // simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
    //  simulation.stop();
     showEle.nodes.map((m) => {
       const previousNode = previousNodes[m.id];
       m.x = previousNode.x;
       m.y = previousNode.y;
     })
      updatePositions(true);
    } else {
      simulation.nodes(showEle.nodes).force("link").links(showEle.links);
      console.log("run static graph layout");
      simulation.force("charge", d3.forceManyBody().strength(expandedAll ? -100 : -250));
      // Static force layout
      // Run the simulation to its end, then draw.
      simulation.alphaTarget(0.1).restart();

      simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
      simulation.stop();
      updatePositions(true);
    }

    viewport.on("zoomed-end", () => {
      if (viewport.dirty) {
        updateVisibility();
        //requestRender();
        viewport.dirty = false;
      }
    });


    // Update search box with searchable items
    updateSearch(showEle.nodes,  graph);
    updateButtons();


  }

  function updateLink (linkGfx, sourceNodeData, targetNodeData, linkAlpha) {
    linkGfx.x = sourceNodeData.x;
    linkGfx.y = sourceNodeData.y;
    linkGfx.rotation = Math.atan2(targetNodeData.y - sourceNodeData.y, targetNodeData.x - sourceNodeData.x);

    const line = linkGfx.getChildByName("LINE");
    const lineLength = Math.max(Math.sqrt((targetNodeData.x - sourceNodeData.x) ** 2 + (targetNodeData.y - sourceNodeData.y) ** 2) - sourceNodeData.radius - targetNodeData.radius, 0);
    line.width = lineLength;
    line.alpha = linkAlpha;

    const arrow = linkGfx.getChildByName("ARROW");
    arrow.alpha = config.showArrows ? 1 : 0;
  }

  function clickNode (nodeName){
    if(expandedAll){
      config.setSelectedNodeNames([nodeName])
    } else if(config.selectedNodeNames.some((s) => s === nodeName)){
      const filteredNodes = config.selectedNodeNames.filter((f) => f !== nodeName);
      config.setSelectedNodeNames(filteredNodes);
    } else {
      const appendedNodes = config.selectedNodeNames.concat([nodeName]);
      config.setSelectedNodeNames(appendedNodes);
    }
    updatePositions();
    drawTree();
  }
  // Update coordinates of all PIXI elements on screen based on force simulation calculations
  function updatePositions(zoomToBounds) {

    expandedAll = nodes.length === config.selectedNodeNames.length;
    const getNodeAlpha = (nodeName, linkCount,label) => {
      if(linkCount === 0 && !config.showSingleNodes) return 0;
      if(expandedAll) return nodeFillOpacity;
      if(config.selectedNodeNames.includes(nodeName)) return nodeFillOpacity;
      return label ? 0 : 0.2;
    }

    const getLinkAlpha = (link, linkLength) => {
      const linkOpacity = linkLength > 200 ? 0.3 : linkStrokeOpacity
      if(expandedAll) return linkOpacity;
      if(
        config.selectedNodeNames.includes(getSourceId(link)) &&
        config.selectedNodeNames.includes(getTargetId(link))
      ) return linkOpacity;
      return 0.1;
    }
    const nodeBounds = {x: [0,0],y:[0,0]};
    d3.select(".animation-container").style("display","none");
    for (let i = 0; i < showEle.nodes.length; i++) {
      let node = showEle.nodes[i];
      const nodeGfx = nodeDataToNodeGfx.get(node);
      const labelGfx = nodeDataToLabelGfx.get(node);

      previousNodes[node.id] = {x: node.x,y:node.y};
      nodeGfx.x = node.x;
      nodeGfx.y = node.y;
      nodeGfx.alpha = getNodeAlpha(nodeGfx.name, node.linkCnt);
      labelGfx.x = node.x;
      labelGfx.y = node.y;
      labelGfx.alpha = getNodeAlpha(nodeGfx.name, node.linkCnt, true)
      if(config.selectedNodeNames.includes(nodeGfx.name)){
        if(node.x < nodeBounds.x[0]){
          nodeBounds.x[0] = node.x;
        }
        if(node.x > nodeBounds.x[1]){
          nodeBounds.x[1] = node.x;
        }
        if(node.y < nodeBounds.y[0]){
          nodeBounds.y[0] = node.y;
        }
        if(node.y > nodeBounds.y[1]){
          nodeBounds.y[1] = node.y;
        }
      }
    }
    if(zoomToBounds){
      zoomToFit(app, viewport, nodeBounds);
    }

    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      const sourceNodeData = showEle.nodes.find((n) => n.id === getTargetId(link));
      const targetNodeData = showEle.nodes.find((n) => n.id === getSourceId(link));
      const linkGfx = linkDataToLinkGfx.get(link);
      const linkAlpha = getLinkAlpha(link, showEle.links.length);
      updateLink (linkGfx, sourceNodeData, targetNodeData,linkAlpha)
    }

    const singleNode = config.selectedNodeNames.length === 1;
    // passing in single node if only one selected - undefined otherwise as unused
    const tooltipNode = singleNode ? showEle.nodes.find((f) => f.NAME === config.selectedNodeNames[0]) : undefined;

    updateTooltip(tooltipNode, false);
  }
  function centroid(nodes) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const d of nodes) {
      let k = nodeRadiusScale(d.linkCnt) ** 2;
      x += d.x * k;
      y += d.y * k;
      z += k;
    }
    return { x: x / z, y: y / z };
  }

  function forceCluster() {
    var strength = 0.8;
    let nodes;
    function force(alpha) {
      const centroids = d3.rollup(nodes, centroid, nodeGroup);
      const l = alpha * strength;
      for (const d of nodes) {

        //if (d.type !== "tier1" && d.type !== "tier2") {
        const { x: cx, y: cy } = centroids.get(`submodule-${d.SUBMODULE}`);
        d.vx -= (d.x - cx) * l;
        d.vy -= (d.y - cy) * l;
        //}
      }
    }
    force.initialize = (_) => (nodes = _);
    force.strength = function (_) {
      return arguments.length ? ((strength = +_), force) : strength;
    };
    return force;
  }




  // not sure about this, leaving for now.
  function reset() {
    // Un-highlight all elements
    showEle.nodes.forEach((node) => {
      const nodeGfx = nodeDataToNodeGfx.get(node);
      nodeGfx.alpha = 1;
      nodeGfx.visible = showNode(singleNodeIDs, node.id) ? false : true;
      const labelGfx = nodeDataToLabelGfx.get(node);
      labelGfx.visible = node.type === "tier1" || node.type === "tier2" ? true : false;
    });

    showEle.links.forEach((link) => {
      const linkGfx = linkDataToLinkGfx.get(link);
      //linkGfx.alpha = showEle.links.length > 200 ? 0.3 : linkStrokeOpacity;
    });

    if (searched) {
      viewport.animate({
        position: new PIXI.Point(0, 0),
        scaleX: 1,
        scaleY: 1,
        time: 1000,
      });
      document.getElementById("search-input").value = "";
      document.getElementById("suggestions-container").innerHTML = "";

    }
     }

  // Function to zoom to a specific node
  function zoomToNode(node) {
    viewport.animate({
      position: new PIXI.Point(node.x, node.y),
      scaleX: 2,
      scaleY: 2,
      time: 800,
    });
  }

  // Function to zoom content to fit
  function zoomToFit(app, viewport, nodeBounds) {

    const boundsWidth = nodeBounds.x[1] - nodeBounds.x[0];
    const boundsHeight = nodeBounds.y[1] - nodeBounds.y[0];
    const stageWidth = width;
    const stageHeight = height;

    // Calculate the scale factor to fit the container in the stage
    const scaleX = stageWidth / boundsWidth;
    const scaleY = stageHeight / boundsHeight;
    const scale = Math.min(scaleX, scaleY);  // Use the smallest scale to fit

    // Apply the scale to the container
    viewport.scale.set(scale);

  }

  // Function to update tooltip content inside a DIV
  function updateTooltip(d, mouseover,xPos) {
    let contentStr = "";
    if(mouseover || config.selectedNodeNames.length === 1){
      let content = [];
      content.push(`<div style="background-color: ${d.color}"><h3 style='text-align: center' >${d.NAME}</h3></div>`); // tooltip title
      // for (const [key, value] of Object.entries(d)) {
      //   // iterate over each attribute object and render
      //   if (key === "fx" || key === "fy" || key === "vx" || key === "vy" || key === "x" || key === "y" || key === "index" || key === "type") break;
      //   content.push(`<div><b>${key}: </b><span>${value}</span></div>`);
      // }
      const datum = nodes.find(node => node.NAME === d.NAME)
      TOOLTIP_KEYS.forEach(key => {
        if(datum[key] && datum[key] !== ""){
          content.push(`<div><b>${key}: </b><span>${datum[key]}</span></div>`);
        }
      })

      content.map((d) => (contentStr += d));
    } else if (!expandedAll) {
      let content = [];
      if(config.selectedNodeNames.length > 0){
        const tableStart = "<table style='font-size: 10px; border-collapse: collapse;  width: 90%;'><thead><tr><th>SUBMODULE</th><th>SEGMENT</th><th>NAME</th></tr></thead><tbody>"
        content.push(tableStart);
        config.selectedNodeNames.forEach((d) => {
          const matchingNode = showEle.nodes.find((f) => f.NAME === d);
          content.push(`<tr style="background-color:${matchingNode.color}; color: white;"><td>${matchingNode.SUBMODULE_NAME}</td><td>${matchingNode.SEGMENT_NAME}</td><td>${d}</td></tr>`); // tooltip title
        })
        const tableEnd = "</tbody></table>";
        content.push(tableEnd);
        contentStr = content.join("");
      }
    }

    let tooltipLeft = 5;
    if(mouseover){
      const visibleWidth = window.innerWidth < 1000 ? window.innerWidth : window.innerWidth - 330;
      if(xPos < 350){
        tooltipLeft = visibleWidth - 380;
      }
    }

    tooltip
      .html(`${contentStr}`)
      //.style('top', event.y - 300+ 'px')
      //.style('left', event.x - 100 + 'px')
      .style("top", 150 + "px") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", tooltipLeft + "px")
      .style("visibility", (expandedAll && !mouseover)  ? "hidden" :"visible");
  }
  //////////////////////////////////////////////////////////////////////////////

  function updateButtons() {
    const hideSingleButton = d3.select("#hide-single-button");

    hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white")
      .on("click", () => {
        config.setShowSingleNodes(!config.showSingleNodes);
        hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white");
        updatePositions(true);
      });

    const showArrowsButton = d3.select("#show-arrows-button");
    showArrowsButton.style("color", config.showArrows ? "white" : "#808080")
      .on("click", () => {
        config.setShowArrows(!config.showArrows);
      showArrowsButton.style("color", config.showArrows ? "white" : "#808080");
      updatePositions(false);
      });
  }
  function updateSearch(variableData, graph) {

    if(!graph) graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const searchInput = document.getElementById("search-input");
    const suggestionsContainer = document.getElementById("suggestions-container");

    d3.selectAll("#search-tab-container").on("mouseover", function (event) {
      event.stopPropagation();
    })
    d3.selectAll("#search-input").on("mouseover mouseout wheel", (event) => {
      event.stopPropagation();
    })

    d3.selectAll("#suggestions-container").on("mouseover mouseout wheel", (event) => {
      event.stopPropagation();
    })

    // Function to filter suggestions based on user input
    function filterSuggestions(input) {
      const fuseOptions = {keys: ["NAME","DEFINITION"], threshold:0.4};
      const fuse = new Fuse(variableData, fuseOptions);
      const result = fuse.search(input);
     return result.map((m) => m.item);
    }

    // Function to update the suggestions dropdown
    function updateSuggestions(input) {
      const filteredSuggestions = filterSuggestions(input);
      suggestionsContainer.innerHTML = "";

      filteredSuggestions.sort(function (a, b) {
        return a.NAME.toLowerCase().localeCompare(b.NAME.toLowerCase());
      });

      filteredSuggestions.forEach((item) => {
        const suggestionElement = document.createElement("div");
        suggestionElement.classList.add("suggestion");
        suggestionElement.textContent = item.DEFINITION ? `${item.NAME} - ${item.DEFINITION}` : item.NAME;
        suggestionElement.addEventListener("click", () => {
          searchInput.value = item.NAME;
          suggestionsContainer.style.display = "none";

          if (showEle.nodes.find((n) => n.NAME === item.NAME)) {
              clickNode(item.NAME)
          }
        });

        suggestionsContainer.appendChild(suggestionElement);
      });

      if (filteredSuggestions.length > 0) {
        suggestionsContainer.style.display = "block";
      } else {
        suggestionsContainer.style.display = "none";
      }
    }

    // Event listener for input changes
    searchInput.addEventListener("input", () => {
      simulation.alpha(0);
      const inputValue = searchInput.value;
      updateSuggestions(inputValue);
    });

  }

}

function initGraphologyGraph(nodes, links) {
  // Initialize a new Graphology graph and add all nodes and edges to it
  // This will be used for shortest path and finding neighbours later
  const graph = new Graph();

  for (let i = 0; i < nodes.length; i++) {
    if (!graph.hasNode(nodes[i].id)) graph.addNode(nodes[i].id);
  }

  for (let i = 0; i < links.length; i++) {
    let srcId = getSourceId(links[i]);
    let targetId = getTargetId(links[i]);
    if (graph.hasNode(srcId) && graph.hasNode(targetId)) {
      if (!graph.hasEdge(srcId, targetId)) {
        graph.addEdge(srcId, targetId);
      }
    }
  }

  return graph;
}
// not sure about these..
function intern(value) {
  return value !== null && typeof value === "object" ? value.valueOf() : value;
}

function getSourceId(d) {
  return d.source && (d.source.id ? d.source.id : d.source);
}
function getTargetId(d) {
  return d.target && (d.target.id ? d.target.id : d.target);
}

function showLink(nodeIDs, d) {
  return nodeIDs.indexOf(getSourceId(d)) !== -1 && nodeIDs.indexOf(getTargetId(d)) !== -1;
}

function showNode(nodeIDs, id) {
  return nodeIDs.indexOf(id) !== -1;
}
