import * as PIXI from 'pixi.js'
import { Viewport } from "pixi-viewport";
import * as d3 from "d3";
import { bfsFromNode } from "graphology-traversal";
import Graph from "graphology";
import Fuse from 'fuse.js'
import { config } from "../config";
import { drawTree, getColorScale } from "../tree";
import { PANEL_WIDTH } from "../constants";
import { dijkstra } from "graphology-shortest-path";

export default async function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector, // id or class selector of DIV to render the graph in
    initial = true,
    nodeRadius,
    nodeFill = "0xFFFFFF", // node stroke fill (if not using a group color encoding)
    nodeStroke = "0xFFFFFF", // node stroke color
    nodeStrokeWidth = 0.5, // node stroke width, in pixels
    nodeFillOpacity = 1, // node stroke opacity
    nodeStrokeOpacity = 1, // node stroke opacity
    nodeMinSize = 6, // node radius, in pixels
    linkStroke = "0xFFFFFF", // link stroke color
    linkStrokeOpacity = 1, // link stroke opacity
    linkStrokeWidth = 0.5, // given d in links, returns a stroke width in pixels
    labelColor = "white",
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels
    tooltipStyles = {
      width: "300px",
      height: "auto",
      "max-height": "300px",
      "overflow-y": "auto",
      padding: "0px",
      "background-color": "white",
      border: "1px solid black",
      "z-index": 10,
    },
    tooltipExtraStyles = {
      width: "auto",
      "max-width": "150px",
      height: "auto",
      padding: "2px",
      "pointer-events":"none",
      "background-color": "white",
      "border-radius": "2px",
      border: "0.5px solid black",
      color: "#404040",
      "z-index": 30,
    },
  } = {}
) {
  console.log("received data", nodes, links);
  if(!nodes) return

  let expandedAll = nodes.length === config.selectedNodeNames.length;
  let TOOLTIP_KEYS = ['NAME', "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"]

  // saving all nodes and links
  const showEle = {nodes, links};

  const nodeDegrees = nodes.reduce((acc, node) => {
    const sourceLinks = links.filter((f) => getSourceId(f) === node.id).length;
    const targetLinks = links.filter((f) => getTargetId(f) === node.id).length;
    acc[node.id] = sourceLinks + targetLinks;
    return acc;
  },{})


  const radiusMax = config.graphDataType === "parameter" ? d3.max(Object.values(nodeDegrees)) : d3.max(showEle.nodes, (d) => d.parameterCount)

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain(nodeRadius ? d3.extent(nodes, nodeRadius) : [0, radiusMax])
    .range([nodeMinSize, nodeMinSize * 3])
    .clamp(true);

  /////////////////// Set up initial  DOM elements on screen ///////////////////
  // Create a container for tooltip that is only visible on mouseover of a node
  let tooltip = d3.select(containerSelector).select(".tooltip");
  if(tooltip.node() === null){
    tooltip = d3.select(containerSelector).append("div").attr("class", "tooltip").style("position", "absolute").style("visibility", "hidden");
  }
  // tooltipExtra is for the button tooltips and the parameters in tooltip multi select view
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

    // build PIXI textures
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

  const resetDefaultNodes = () => {
    const previousPositions = config.defaultNodePositions;
    showEle.nodes.map((m) => {
      const previousNode = previousPositions[m.id];
      m.x = previousNode.x;
      m.y = previousNode.y;
    })
  }
  update(true);

  /////////////////////// SIMULATION-RELATED FUNCTIONS /////////////////////////
  function update() {

    const color = getColorScale();

    showEle.nodes = showEle.nodes.reduce((acc, node) => {
      if(config.graphDataType !== "parameter"){
        node.id = node.NAME;
      }
      node.radiusVar = config.graphDataType === "parameter" ? nodeDegrees[node.id] : node.parameterCount;
      node.color = color(node.subModule);
      node.radius = nodeRadiusScale(node.radiusVar);
      acc.push(node);
      return acc;
    },[])



    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      link.linkStroke = linkStroke;
      link.linkStrokeWidth = linkStrokeWidth;
    }
    console.log("elements on screen", showEle);
    // Stores graph in a Graphology object just for the shortest path and nearest neighbour calculations
    const graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const updateVisibility = () => {
      const zoom = viewport.scale.x;
      const zoomSteps = [1, 2, 3, Infinity];
      const zoomStep = zoomSteps.findIndex((zoomStep) => zoom <= zoomStep);

      for (let i = 0; i < showEle.nodes.length; i++) {
        const labelGfx = nodeDataToLabelGfx.get(showEle.nodes[i]);
        labelGfx.visible = zoomStep >= 3;
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
                const linkAlpha = showEle.links.length > 200 ? 0.3 : linkStrokeOpacity
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
              event.currentTarget.children[0].tint = node.color;
              clickNode(node.NAME, "node");
            }
          })
          nodeGfx.on("mouseover", (event) =>
          {
            const node = nodeGfxToNodeData.get(event.currentTarget);
            if(node.visible && node.alpha > 0 && event.srcElement.tagName === "CANVAS"){
              event.currentTarget.children[0].tint = "white";
              event.currentTarget.alpha = 1;
              updateTooltip(nodeGfxToNodeData.get(event.currentTarget),true, event.x)
            }
          });
          nodeGfx.on("mouseout", (event) => {
            const node = nodeGfxToNodeData.get(event.currentTarget);
            event.currentTarget.children[0].tint = node.color;
            event.currentTarget.alpha = node.alpha;
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
          labelGfx.visible =  false;

          const textStyle = new PIXI.TextStyle({
            fontFamily: "Lato",
            fontSize: 8,
            align: "left",
            fill: labelColor,
          });

          const label = new PIXI.Text(nodeData.NAME, textStyle);
          label.name = "LABEL";

          // position label at the middle of node
          const textMetrics = PIXI.TextMetrics.measureText(nodeData.NAME, textStyle)
          label.x = -textMetrics.width/4
          label.y = nodeData.radius - 0.5;

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
     * - Create a link container to hold the graphics
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
      if(config.currentLayout === "default"){
       resetDefaultNodes();
      }
      updatePositions(true);
    } else {
      simulation.nodes(showEle.nodes).force("link").links(showEle.links);
      console.log("run static graph layout");
      simulation.force("charge", d3.forceManyBody().strength(expandedAll ? -100 : -250));
      // Static force layout
      // Run the simulation to its end, then draw.
      simulation.alphaTarget(0.1).restart();

      const tickTime = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()));
      simulation.tick(tickTime);
      simulation.stop();
      if(config.graphDataType === "parameter"){
        const defaultNodePositions = showEle.nodes.reduce((acc, node) => {
          acc[node.id] =  { x: node.x, y: node.y};
          return acc
        },{})
        config.setDefaultNodePositions(defaultNodePositions)
      }
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
    updateSearch(showEle.nodes,  graph,"");
    updateSearch(showEle.nodes, graph,"-sp-end")
    updateButtons(graph);

  }


  const getNeighbours =(graph,nameArray, direction, nnDepth, previousNNNodes) =>  nameArray.reduce((acc, origin) => {

    bfsFromNode(graph, origin, function (node, attr, depth) {
        if (depth <= 1 && node !== origin && !previousNNNodes.some((s) => s === node) && !acc.some((s) => s.node === node)) {
          const source = direction === "outbound" ? origin : node;
          const target = direction === "outbound" ? node : origin;
          acc.push({
            source, target, direction,depth: nnDepth, node
          })
        }
      }, {mode: direction});

     return acc;
    }, [])

  const getNearestNeighbourLinks = (graph) => {
    const depth1OutboundLinks = getNeighbours(graph,[config.nearestNeighbourOrigin], "outbound",1,[]);
    const depth1InboundLinks = getNeighbours(graph,[config.nearestNeighbourOrigin],"inbound",1,[]);
    const depth1Links = depth1OutboundLinks.concat(depth1InboundLinks);
    if(config.nearestNeighbourDegree > 1 && depth1Links.length > 0){
      const depth1NodeNames = [config.nearestNeighbourOrigin].concat(depth1Links.map((m) => m.node));
      const depth2OutboundLinks = getNeighbours(graph,depth1OutboundLinks.map((m) => m.node),"outbound",2,depth1NodeNames);
      const depth2InboundLinks = getNeighbours(graph, depth1InboundLinks.map((m) => m.node),"inbound",2,depth1NodeNames);
      const depth2Links = depth2OutboundLinks.concat(depth2InboundLinks);
      if(config.nearestNeighbourDegree > 2 && depth2Links.length > 0){
        const depth2NodeNames = depth1NodeNames.concat(depth2Links.map((m) => m.node));
        const depth3OutboundLinks = getNeighbours(graph,depth2OutboundLinks.map((m) => m.node),"outbound",3,depth2NodeNames);
        const depth3InboundLinks = getNeighbours(graph, depth2InboundLinks.map((m) => m.node),"inbound",3,depth2NodeNames);
        const depth3Links = depth3OutboundLinks.concat(depth3InboundLinks);
        return depth1Links.concat(depth2Links).concat(depth3Links);

      }
      return depth1Links.concat(depth2Links);
    }
    return depth1Links
  }
  function positionNearestNeighbours(graph) {

    const nnLinks = getNearestNeighbourLinks(graph);
    const getMax = (direction) =>
      d3.max(nnLinks.filter((f) => f.direction === direction),
        (m) => m.depth) || 0

    const totalDepth =  getMax("inbound") + getMax("outbound") - 1;

    const getHierarchy = (parentId, id, direction, rootLink) =>  d3
      .stratify()
      .parentId((d) => d[parentId])
      .id((d) => d[id])(
        rootLink.concat(
          nnLinks.filter((f) => f.direction === direction)
        )
      )
    const inboundRootLink = [{ target: "", source: config.nearestNeighbourOrigin }];
    const inboundHierarchy = getHierarchy("target","source","inbound",inboundRootLink);

    const outboundRootLink = [{ source: "", target: config.nearestNeighbourOrigin }];
    const outboundHierarchy = getHierarchy("source","target","outbound",outboundRootLink);

    const eleNodes = nnLinks.reduce((acc, link) => {
      if(!acc.some((s) => s.NAME === link.source)){
        const matchingNode = showEle.nodes.find((f) => f.NAME === link.source);
        acc.push(matchingNode)
      }
      if(!acc.some((s) => s.NAME === link.target)){
        const matchingNode = showEle.nodes.find((f) => f.NAME === link.target);
        acc.push(matchingNode)
      }
      return acc;
    },[])

    const radiusByDepthDirection = nnLinks.reduce((acc, link) => {
      const depthDirection = `${link.depth}-${link.direction}`;
      if(!acc[depthDirection]){acc[depthDirection] = 0};
      const matchingNode = showEle.nodes.find((f) => f.NAME === link[link.direction === "outbound" ? "source" : "target"]);
      acc[depthDirection] += (matchingNode.radius * 2.1);
      return acc;
    },{})



    const maxColumnRadius = nnLinks.length === 0 ? 0 : d3.max(Object.values(radiusByDepthDirection));
    const maxKey = Object.keys(radiusByDepthDirection).find((f) => radiusByDepthDirection[f] === maxColumnRadius);

    let filteredLinks = [];
    if(maxKey){
      const maxKeySplit = maxKey.split("-");
      filteredLinks = nnLinks.filter((f) => f.depth === +maxKeySplit[0] && f.direction === maxKeySplit[1]);
    }

    const dx = maxColumnRadius > height ? height/(filteredLinks.length/3) : maxColumnRadius;

    const visibleWidth = window.innerWidth < 1000 ? window.innerWidth : window.innerWidth - PANEL_WIDTH;
    const dy = (visibleWidth - dx * 2) / totalDepth;

    const getTree = (hierarchy) =>  d3
      .tree()
      .nodeSize([dx, dy])(hierarchy)
      .descendants()
      .filter((f) => f.depth > 0)

    const getAllNodePositions = () => {
      const centralNodes = [{ name: config.nearestNeighbourOrigin, x: 0, y: 0, direction: "center", depth: 0 }];
      const inboundNodes = getTree(inboundHierarchy).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: -node.y,
          y: node.x,
          direction: "in",
          depth: node.depth
        });
        return acc;
      }, []);
      const outboundNodes = getTree(outboundHierarchy).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: node.y,
          y: node.x,
          direction: "out",
          depth: node.depth
        });
        return acc;
      }, []);
      const allNodes = centralNodes.concat(inboundNodes).concat(outboundNodes);
      return allNodes.reduce((acc, node) => {
        const matchingNode = showEle.nodes.find((f) => f.NAME === node.name);
        node.radius = matchingNode.radius;
        acc.push(node);
        return acc;
      },[])
    }

    const allNNNodes = getAllNodePositions();
    const nodesByColumn = Array.from(d3.group(allNNNodes, (g) => `${g.direction}-${g.depth}`));
    const groupsWithHeightInRange = nodesByColumn.filter((f) => f[1].length > 1 && d3.sum(f[1], (s) => s.radius * 2.1) < height);
    groupsWithHeightInRange.forEach((group) => {
      let currentY = -(d3.sum(group[1], (s) => s.radius * 2.1))/2;
      group[1].forEach((node) => {
        node.y = currentY + node.radius;
        currentY += (node.radius * 2.1);
      })
    })

    if(maxColumnRadius > height){
      // now the simulation part
      const ySimulation = d3.forceSimulation()
        .alphaDecay(0.1)
        .force('x', d3.forceX((d) => d.x).strength(0.8))
        .force('y', d3.forceY((d) => d.y).strength(0.8))
        .force('collide', d3.forceCollide().radius((d) => d.radius * 1.1).strength(0.6));
      ySimulation.stop();
      ySimulation.nodes(allNNNodes);
      ySimulation.tick(300);
    }

    config.setNotDefaultSelectedLinks(nnLinks);
    config.setNotDefaultSelectedNodeNames(allNNNodes);

    updatePositions(true);
  }

  function positionShortestPath (graph) {
    const connectedNodes = dijkstra.bidirectional(graph, config.shortestPathStart, config.shortestPathEnd);
    if(connectedNodes){
      const connectedLinks = connectedNodes.reduce((acc, node,index) => {
        if(index > 0){
          const previousConnection = connectedNodes[index - 1];
          const matchingLink = showEle.links.find((f) => getSourceId(f) === previousConnection && getTargetId(f) === node);
          if(matchingLink){
            acc.push({
              source:previousConnection,
              target: node,
              node: previousConnection,
              depth: 1,
              direction:"outbound"
            })
          }
        }
        return acc;
      },[])
      let nodeGap = 50;
      const nodeStart = -(connectedNodes.length * nodeGap)/2
      const connectedChartNodes = connectedNodes.reduce((acc, node, index) => {
        const matchingNode = showEle.nodes.find((f) => f.NAME === node);
        if(index === 0){
          nodeGap -= matchingNode.radius
        }
        acc.push({
          name: matchingNode.id,
          x: nodeStart + (nodeGap * index),
          y: 0,
          direction: "out"
        });
      return acc
      },[]);
      config.setNotDefaultSelectedLinks(connectedLinks);
      config.setNotDefaultSelectedNodeNames(connectedChartNodes);
    } else {
      d3.select("#noShortestPathMessage").style("visibility","visible");
      config.setNotDefaultSelectedLinks([]);
      config.setNotDefaultSelectedNodeNames([]);
    }

    updatePositions(true);

  }

  function updateLink (linkGfx, sourceNodeData, targetNodeData, linkAlpha) {
    // used in update + updatePositions
    linkGfx.x = sourceNodeData.x;
    linkGfx.y = sourceNodeData.y;
    linkGfx.rotation = Math.atan2(targetNodeData.y - sourceNodeData.y, targetNodeData.x - sourceNodeData.x);

    const line = linkGfx.getChildByName("LINE");
    const lineLength = Math.max(Math.sqrt((targetNodeData.x - sourceNodeData.x) ** 2 + (targetNodeData.y - sourceNodeData.y) ** 2) - sourceNodeData.radius - targetNodeData.radius, 0);
    line.width = lineLength;
    line.alpha = config.currentLayout !== "default" && linkAlpha > 0 ? 0.3 : linkAlpha;
    line.visible = linkAlpha !== 0;

    const arrow = linkGfx.getChildByName("ARROW");
    arrow.alpha = config.showArrows ? 1 : 0;
    arrow.visible = config.showArrows;
  }

  function clickNode (nodeName,origin, graph){
    d3.select("#noShortestPathMessage").style("visibility","hidden");
    if(origin === "search" && config.currentLayout === "nearestNeighbour"){
      config.setNearestNeighbourOrigin(nodeName);
      positionNearestNeighbours(graph);
    } else if (config.currentLayout === "shortestPath") {
      if(origin === "search"){
        config.setShortestPathStart(nodeName);
      } else {
        config.setShortestPathEnd(nodeName);
      }
      if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
        positionShortestPath(graph);
      }
    }else if(expandedAll){
      config.setSelectedNodeNames([nodeName])
    } else if(config.selectedNodeNames.some((s) => s === nodeName)){
      const filteredNodes = config.selectedNodeNames.filter((f) => f !== nodeName);
      if(filteredNodes.length === 0){
        config.setSelectedNodeNames(config.allNodeNames);
      } else {
        config.setSelectedNodeNames(filteredNodes);
      }
    } else {
      const appendedNodes = config.selectedNodeNames.concat([nodeName]);
      config.setSelectedNodeNames(appendedNodes);
    }
    updatePositions();
    if(config.currentLayout === "default"){
      drawTree();
    }
  }
  // Update coordinates of all PIXI elements on screen based on force simulation calculations
  function updatePositions(zoomToBounds) {

    expandedAll = nodes.length === config.selectedNodeNames.length;
    const getNodeAlpha = (nodeName, linkCount,label) => {
      if(config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin === "") return 0;
      if(config.currentLayout === "shortestPath" && (config.shortestPathStart === "" || config.shortestPathEnd === "")) return 0;
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

      if(config.currentLayout === "default"){
        nodeGfx.alpha = getNodeAlpha(nodeGfx.name, node.linkCnt);
        nodeGfx.x = node.x;
        nodeGfx.y = node.y;
        labelGfx.x = node.x;
        labelGfx.y = node.y;
        node.alpha = nodeGfx.alpha;
      } else {
        if((config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin === "") ||
          (config.currentLayout === "shortestPath" && (config.shortestPathStart === "" || config.shortestPathEnd === ""))){
          nodeGfx.alpha = 0;
        } else {
          const matchingNode = config.notDefaultSelectedNodeNames.find((f) => f.name === node.NAME);
          if (matchingNode) {
            nodeGfx.alpha = 1;
            nodeGfx.x = matchingNode.x;
            nodeGfx.y = matchingNode.y;
            labelGfx.x = matchingNode.x;
            labelGfx.y = matchingNode.y;
            node.x = matchingNode.x;
            node.y = matchingNode.y;
            node.alpha = 1;
          } else {
            nodeGfx.alpha = 0;
            node.alpha = 0;
          }
        }
      }
      nodeGfx.visible = nodeGfx.alpha !== 0;
      node.visible = nodeGfx.visible;
      labelGfx.alpha = !node.visible ? 0 : getNodeAlpha(nodeGfx.name, node.linkCnt, true)

      if((config.selectedNodeNames.includes(nodeGfx.name) && config.currentLayout === "default")
        || config.notDefaultSelectedNodeNames.some((s) => s.name === node.NAME)){
        if(nodeGfx.x < nodeBounds.x[0]){
          nodeBounds.x[0] = nodeGfx.x;
        }
        if(nodeGfx.x > nodeBounds.x[1]){
          nodeBounds.x[1] = nodeGfx.x;
        }
        if(nodeGfx.y < nodeBounds.y[0]){
          nodeBounds.y[0] = nodeGfx.y;
        }
        if(nodeGfx.y > nodeBounds.y[1]){
          nodeBounds.y[1] = nodeGfx.y;
        }
      }
    }

    if(zoomToBounds){
      zoomToFit(app, viewport, nodeBounds);
    }

    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      const targetId = getTargetId(link);
      const sourceId = getSourceId(link);
      const sourceNodeData = showEle.nodes.find((n) => n.id === targetId);
      const targetNodeData = showEle.nodes.find((n) => n.id === sourceId);
      const linkGfx = linkDataToLinkGfx.get(link);
      let linkAlpha = 0;
      if(config.currentLayout === "default"){
        linkAlpha = getLinkAlpha(link, showEle.links.length);
      } else if (config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin === ""){
        linkAlpha = 0;
      } else if (config.currentLayout === "shortestPath" && (config.shortestPathStart === "" || config.shortestPathEnd === "")){
        linkAlpha = 0;
      } else {
        if(config.notDefaultSelectedLinks.some((s) => s.source === sourceId && s.target === targetId)){
          const visibleAlpha = config.notDefaultSelectedNodeNames.length > 300 ? 0.3 : linkStrokeOpacity;
          linkAlpha = sourceNodeData.alpha === 1 && targetNodeData.alpha === 1 ? visibleAlpha: 0;
        } else {
          linkAlpha = 0
        }
      }
      updateLink (linkGfx, sourceNodeData, targetNodeData,linkAlpha);

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
      let k = nodeRadiusScale(d.radiusVar) ** 2;
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
      const centroids = d3.rollup(nodes, centroid, (r) => r.subModule);
      const l = alpha * strength;
      for (const d of nodes) {
        //if (d.type !== "tier1" && d.type !== "tier2") {
        const { x: cx, y: cy } = centroids.get(d.subModule);
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

  // Function to zoom content to fit
  function zoomToFit(app, viewport, nodeBounds) {

    const maxRadius = nodeMinSize * 6;
    const boundsWidth = nodeBounds.x[1] - nodeBounds.x[0] + maxRadius;
    const boundsHeight = nodeBounds.y[1] - nodeBounds.y[0] + maxRadius;
    const stageWidth = width;
    const stageHeight = height;

    // Calculate the scale factor to fit the container in the stage
    const scaleX = stageWidth / boundsWidth;
    const scaleY = stageHeight / boundsHeight;
    const scale = Math.min(scaleX, scaleY);  // Use the smallest scale to fit
    // resetting viewport before zoom
    viewport.scale.set(1);
    viewport.x = stageWidth/2;
    viewport.y = stageHeight/2;
    // Apply the scale to the container
    viewport.scale.set(scale);


   // const minDimensions = Math.min(stageWidth,stageHeight);
    //viewport.x =  minDimensions/2 + (stageWidth - boundsWidth * scale) / 2;
    //viewport.y = minDimensions/2 + (stageHeight - boundsHeight * scale) / 2;
  }

  // Function to update tooltip content inside a DIV
  function updateTooltip(d, mouseover,xPos) {
    let contentStr = "";
    let nodeTableMapper = {};
    const defaultAndOne = config.currentLayout === "default" && config.selectedNodeNames.length === 1;
    const otherAndOne = config.currentLayout !== "default" && config.notDefaultSelectedNodeNames.length == 1;
    const listToShow = config.currentLayout === "default" ? config.selectedNodeNames : config.notDefaultSelectedNodeNames;
    if(mouseover || defaultAndOne || otherAndOne){
      tooltip.style("padding","10px");
      let content = [];
      content.push(`<div style="background-color: ${d.color} "><h3 style='text-align: center' >${d.NAME}</h3></div>`); // tooltip title
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
       if(listToShow.length > 0){
        tooltip.style("padding","0px")
        const tableStart = "<table style='font-size: 10px; border-collapse: collapse;  width: 100%;'><thead><tr><th style='width:45%;'>SUBMODULE-SEGMENT</th><th style='width:50%;'>NAME</th><th style='width:5%'></th></tr></thead><tbody>"
        content.push(tableStart);
        let nodeRows = []
        listToShow.forEach((d,i) => {
          const matchingNode = showEle.nodes.find((f) => f.NAME === d);
          nodeRows.push({row: `<tr><td style="background-color:${matchingNode.color}; color: white; width:50%;">${matchingNode.SUBMODULE_NAME} - ${matchingNode.SEGMENT_NAME}</td><td class="nodeTableRow" id='nodeTableRow${i}' style="width:50%;">${d}</td><td style='width:5%'> <i class='fas fa-trash'></i></td></tr>`, subModule: matchingNode.SUBMODULE_NAME, name: matchingNode.NAME}); // tooltip title
          nodeTableMapper[`nodeTableRow${i}`] = matchingNode["Parameter Explanation"];
        })
        nodeRows = nodeRows.sort((a,b) => d3.ascending(a.subModule, b.subModule) || d3.ascending(a.name, b.name));
        content = content.concat(nodeRows.map((m) => m.row));
        const tableEnd = "</tbody></table>";
        content.push(tableEnd);
        contentStr = content.join("");
      }
    }

    let tooltipLeft = 5;
    if(mouseover){
      const visibleWidth = window.innerWidth < 1000 ? window.innerWidth : window.innerWidth - PANEL_WIDTH;
      if(xPos < (PANEL_WIDTH + 20)){
        tooltipLeft = visibleWidth - PANEL_WIDTH + 50;
      }
    }

    tooltip
      .html(`${contentStr}`)
      //.style('top', event.y - 300+ 'px')
      //.style('left', event.x - 100 + 'px')
      .style("top", 150 + "px") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", tooltipLeft + "px")
      .style("visibility", (expandedAll && !mouseover) || listToShow.length === 0 ? "hidden" :"visible");

    d3.selectAll(".nodeTableRow")
      .style("cursor", function () {
        return nodeTableMapper[this.id] && nodeTableMapper[this.id] !== "" ? "pointer" : "default"
      })
      .attr("pointer-events", function ()  {
        return nodeTableMapper[this.id] && nodeTableMapper[this.id] !== "" ? "all" : "none"
      })
      .on("mouseover mousemove", (event) => {
        const id = event.currentTarget.id;
        if(nodeTableMapper[id] && nodeTableMapper[id] !== ""){
          showTooltipExtra(event.x, event.y, nodeTableMapper[id])

        }
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })

  }
  //////////////////////////////////////////////////////////////////////////////

  const measureWidth = (text, fontSize) => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
  }
  const showTooltipExtra = (x, y,textContent) => {
    const textWidth = measureWidth(textContent,16);
    let tooltipLeft = x - (textWidth/2);
    if((x + textWidth) > width){
      tooltipLeft = x - textWidth;
    }
    if((x - textWidth) < 0){
      tooltipLeft = x;
    }
    let tooltipTop = y + 16;
    if((tooltipTop + 16) > height){
      tooltipTop = y - 30;
    }
    tooltipExtra.style("left", `${tooltipLeft}px`)
      .style("font-size", "10px")
      .style("top",`${tooltipTop}px`)
      .style("visibility", "visible")
      .text(textContent)

  }
  function updateButtons(graph) {
    const hideSingleButton = d3.select("#hide-single-button");

    hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white")
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, config.showSingleNodes ? "hide single nodes" : "show single nodes")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", () => {
        config.setShowSingleNodes(!config.showSingleNodes);
        hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white");
        updatePositions(false);
      });

    const showArrowsButton = d3.select("#show-arrows-button");
    showArrowsButton.style("color", config.showArrows ? "white" : "#808080")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, config.showArrows ? "hide arrows" : "show arrows")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", () => {
        config.setShowArrows(!config.showArrows);
      showArrowsButton.style("color", config.showArrows ? "white" : "#808080");
      updatePositions(false);
      });


    const layoutButton = d3.select("#layout-button");

    layoutButton
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, "toggle layouts")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })

    const degreeSlider =   d3.select("#nnDegree");

    // Listen for 'input' event to capture real-time changes
    degreeSlider.on("input", function() {
      config.setNearestNeighbourDegree(this.value);
      d3.select("#nnDegreeValue").html(this.value);
      if(config.nearestNeighbourOrigin !== ""){
        positionNearestNeighbours(graph);
      }
    });

    d3.selectAll(".zoom-button")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, event.currentTarget.id.replace(/-/g,' '))
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        const buttonId = event.currentTarget.id;
        if(buttonId === "zoom-in"){
          // scales are even width/height;
          const currentScale = viewport.scale.x;
          viewport.scale.set(currentScale * 1.1);
        } else if(buttonId === "zoom-out"){
          // scales are even width/height;
          const currentScale = viewport.scale.x;
          viewport.scale.set(currentScale * 0.9);
        } else{
          updatePositions(true);
        }
      })
    const layoutOptions = d3.selectAll(".dropdown-item")

    layoutOptions.style("color", (d, i, objects) => {
      return config.currentLayout === objects[i].id ? "white" : "#808080";
    })
      .on("click", (event) => {
        const newLayout = event.currentTarget.id;
      config.setCurrentLayout(newLayout);
      d3.select("#search-input").property("value","");
      d3.select("#search-tab-container").style("height","auto");
        d3.select("#noShortestPathMessage").style("visibility","hidden");
      if(newLayout === "default"){
        d3.select("#view").style("display","block");
        d3.select("#tabbed-component").classed("hidden",window.innerWidth < 1000 );
        d3.select("#showInfo").classed("hidden",window.innerWidth >= 1000);
        d3.select("#hideInfo").classed("hidden",window.innerWidth < 1000);
        d3.selectAll(".viewButton").style("opacity",1);
        d3.select("#nnDegreeDiv").style("display","none");
        d3.selectAll("#search-input").attr("placeholder","Search for variables");
        d3.select("#hide-single-button").style("cursor","pointer").attr("disabled",false);
        d3.select('#search-container-sp-end').style("display","none");
        resetDefaultNodes();
      } else {
        config.setNotDefaultSelectedNodeNames([]);
        config.setNotDefaultSelectedLinks([]);
        d3.select("#view").style("display","none");
        d3.select("#tabbed-component").classed("hidden",true);
        d3.selectAll(".viewButton").style("opacity",0);
        d3.select("#hide-single-button").style("cursor","not-allowed").attr("disabled",true);
        if(config.currentLayout === "nearestNeighbour"){
          d3.select('#search-container-sp-end').style("display","none");
          d3.select("#nnDegreeDiv").style("display","block");
          d3.select("#search-tab-container").style("height","110px");
          d3.selectAll("#search-container").attr("placeholder","Search for origin node");
        }
        if(config.currentLayout === "shortestPath"){
          d3.select('#search-container-sp-end').style("display","block");
          d3.select("#search-input-sp-end").property("value","");
          d3.select("#search-tab-container").style("height","120px");
          d3.select("#nnDegreeDiv").style("display","none");
          d3.selectAll("#search-input").attr("placeholder","Search for start node");
        }
      }
        layoutOptions.style("color", (d, i, objects) => {
          return config.currentLayout === objects[i].id ? "white" : "#808080";
        })
        updatePositions(false);
    });
  }
  function updateSearch(variableData, graph, extraIdString) {

    if(!graph) graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const searchInput = document.getElementById(`search-input${extraIdString}`);
    const suggestionsContainer = document.getElementById(`suggestions-container${extraIdString}`);


    d3.selectAll(`search-input${extraIdString}`).on("wheel", (event) => {
      event.stopPropagation();
    })

    d3.selectAll(`suggestions-container${extraIdString}`).on("wheel", (event) => {
      event.stopPropagation();
    })

    // Function to filter suggestions based on user input
    function filterSuggestions(input) {
      const fuseOptions = {keys: ["NAME","DEFINITION"], threshold:0.4};
      const fuse = new Fuse(variableData, fuseOptions);
      const result = fuse.search(input);
      // from Chat GPT (with some help)

      // If you want exact matches to come at the very top, you can filter first for exact matches
      const exactMatches = result.filter(m => m.item.NAME.toLowerCase().startsWith(input.toLowerCase()));
      const nonExactMatches = result.filter(m => !m.item.NAME.startsWith(input))
        .sort((a,b) => a.item.NAME.toLowerCase().localeCompare(b.item.NAME.toLowerCase()));


      // Combine exact matches with non-exact matches
      const finalResults = [...exactMatches, ...nonExactMatches];

      return finalResults.map((m) => m.item);
    }

    // Function to update the suggestions dropdown
    function updateSuggestions(input) {
      const filteredSuggestions = filterSuggestions(input);
      suggestionsContainer.innerHTML = "";

     // filteredSuggestions.sort(function (a, b) {
    //    return a.NAME.toLowerCase().localeCompare(b.NAME.toLowerCase());
    //  });

      filteredSuggestions.forEach((item) => {
        const suggestionElement = document.createElement("div");
        suggestionElement.classList.add("suggestion");
        suggestionElement.textContent = item.DEFINITION ? `${item.NAME} - ${item.DEFINITION}` : item.NAME;
        suggestionElement.addEventListener("click", () => {
          searchInput.value = item.NAME;
          suggestionsContainer.style.display = "none";

          if (showEle.nodes.find((n) => n.NAME === item.NAME)) {
              clickNode(item.NAME, `search${extraIdString}`, graph);
              if(config.currentLayout === "default"){
                searchInput.value = "";
              }
          } else {
            if(config.currentLayout !== "default" && item.NAME === ""){
              config.setNotDefaultSelectedLinks([]);
              config.setNotDefaultSelectedNodeNames([]);
              updatePositions(false);
            }
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
