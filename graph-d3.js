import * as PIXI from 'pixi.js'
import { Viewport } from "pixi-viewport";
import * as d3 from "d3";
import { bfsFromNode } from "graphology-traversal";
import Graph from "graphology";
import Fuse from 'fuse.js'
import { config } from "./config";
import { drawTree, getColorScale } from "./tree";
import { PANEL_WIDTH } from "./constants";
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
    nodeStroke = "0xFFFFFF", // node stroke color
    nodeStrokeWidth = 0.5, // node stroke width, in pixels
    nodeFillOpacity = 1, // node stroke opacity
    nodeMinSize = 6, // node radius, in pixels
    linkStroke = "0xFFFFFF", // link stroke color
    labelColor = "white",
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels
    tooltipStyles = {
      width: "300px",
      height: "auto",
      "max-height": "200px",
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
  if (!nodes) return;
   d3.select("#parameter-menu").style("display", config.graphDataType === "parameter" ? "block" : "none");
   d3.selectAll(".viewButton").style("top",`${config.graphDataType === "parameter" ? 73 : 23}px`)
  let expandedAll = nodes.length === config.selectedNodeNames.length;
  let TOOLTIP_KEYS = ['NAME', "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"]

  // saving all nodes and links
  const showEle = { nodes, links };

  const nodeDegrees = nodes.reduce((acc, node) => {
    const sourceLinks = links.filter((f) => getSourceId(f) === node.id).length;
    const targetLinks = links.filter((f) => getTargetId(f) === node.id).length;
    acc[node.id] = sourceLinks + targetLinks;
    return acc;
  }, {})

  const radiusMax = config.graphDataType === "parameter" ? d3.max(Object.values(nodeDegrees)) : d3.max(showEle.nodes, (d) => d.parameterCount)

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain(nodeRadius ? d3.extent(nodes, nodeRadius) : [0, radiusMax])
    .range([nodeMinSize, nodeMinSize * 3])
    .clamp(true);

  const color = getColorScale();

  showEle.nodes = showEle.nodes.reduce((acc, node) => {
    node.radiusVar = config.graphDataType === "parameter" ? nodeDegrees[node.id] : node.parameterCount;
    node.color = color(node.subModule);
    node.radius = nodeRadiusScale(node.radiusVar);
    acc.push(node);
    return acc;
  }, [])

  /////////////////// Set up initial  DOM elements on screen ///////////////////
  // Create a container for tooltip that is only visible on mouseover of a node
  let tooltip = d3.select(containerSelector).select(".tooltip");
  if (tooltip.node() === null) {
    tooltip = d3.select(containerSelector).append("div").attr("class", "tooltip").style("position", "absolute").style("visibility", "hidden");
  }
  // tooltipExtra is for the button tooltips and the parameters in tooltip multi select view
  let tooltipExtra = d3.select(containerSelector).select(".tooltipExtra");
  if (tooltipExtra.node() === null) {
    tooltipExtra = d3.select(containerSelector).append("div").attr("class", "tooltipExtra").style("position", "absolute").style("visibility", "hidden");
  }

  for (const prop in tooltipStyles) {
    tooltip.style(prop, tooltipStyles[prop]);
    tooltipExtra.style(prop, tooltipExtraStyles[prop]);
  }

  const graph = initGraphologyGraph(showEle.nodes, showEle.links);

  // Initialize simulation
  const simulation = d3
    .forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id).strength((link) => {
      if(config.graphDataType !== "parameter"){
        return 0
      } // default from https://d3js.org/d3-force/link
      return 1 / Math.min(link.source.radiusVar, link.target.radiusVar)
    }))
    .force("x", d3.forceX((d) => d.x))
    .force("y", d3.forceY((d) => d.y))
    .force("collide", d3.forceCollide()
      .radius((d) => config.graphDataType === "parameter" ? d.radius : d.radius * 1.5)
      .iterations(3)
    )
    .force("cluster", forceCluster().strength(0.45)) // cluster all nodes belonging to the same submodule.

  simulation.stop();

  // tooltipExtra is for the button tooltips and the parameters in tooltip multi select view
  let baseSvg = d3.select(containerSelector).select("svg");
  if (baseSvg.node() === null) {
    baseSvg = d3.select(containerSelector).append("svg").attr("width", width).attr("height", height);
    const actualSvg = baseSvg.append("g").attr("class", "chartGroup")
    actualSvg.append("g").attr("class", "linkGroup");
    actualSvg.append("g").attr("class", "nodeGroup");
    const defs = actualSvg.append("defs");
    defs.append("marker").attr("class", "markerGroupStart")
      .append("svg:path").attr("class", "markerPathStart");
    defs.append("marker").attr("class", "markerGroupEnd")
      .append("svg:path").attr("class", "markerPathEnd");
  }
  const svg = d3.select(".chartGroup");

  svg.select(".markerGroupStart")
    .attr("id", "arrowPathStart")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 5)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathStart")
    .attr("fill", "#A0A0A0")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M9,-4L1,0L9,4") // M9,-4L1,0L9,4 (start)

  svg.select(".markerGroupEnd")
    .attr("id", "arrowPathEnd")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 5)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathEnd")
    .attr("fill", "#A0A0A0")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M1, -4L9,0L1,4") // M9,-4L1,0L9,4 (start)


  let currentZoomLevel = 1;
  const zoom = d3
    .zoom()
    .on("zoom", (event) => {
      const { x, y, k } = event.transform;
      currentZoomLevel = k;
      svg.attr("transform", `translate(${x},${y}) scale(${k})`);
      if(config.currentLayout === "default" && config.graphDataType === "parameter"){
        svg.selectAll(".nodeLabel").style("display",currentZoomLevel > 3 ? "block":"none");
      }
    });

  baseSvg.call(zoom).on("dblclick.zoom", null);

  const getZoomCalculations = (currentNodes) => {
    // might have to have a maxRadius here
    const [xExtent0, xExtent1] = d3.extent(currentNodes, (d) => d.fx || d.x);
    const [yExtent0, yExtent1] = d3.extent(currentNodes, (d) => d.fy || d.y);
    if (xExtent0 && xExtent1 && yExtent0 && yExtent1) {
        let xWidth = xExtent1 - xExtent0 + 20;
      let yWidth = yExtent1 - yExtent0 + 20;

      const translateX = -(xExtent0 + xExtent1) / 2;
      const translateY = -(yExtent0 + yExtent1) / 2;
      const fitToScale = 0.95 / Math.max(xWidth / width, yWidth / height);
      return {translateX, translateY, fitToScale};
    }
    return {translateX: 0, translateY: 0, fitToScale: 1};
  };
  const performZoomAction  =  (
    currentNodes,
    transitionTime,
    zoomAction) =>  {
    if (zoomAction === 'zoomIn') {
      baseSvg.interrupt().transition().duration(transitionTime).call(zoom.scaleBy, 2);
    }
    if (zoomAction === 'zoomOut') {
      baseSvg.interrupt().transition().duration(transitionTime).call(zoom.scaleBy, 0.5);
    }
    if (zoomAction === 'zoomFit') {
      const {translateX, translateY, fitToScale} = getZoomCalculations(currentNodes);
      baseSvg
        .interrupt()
        .transition()
        .duration(transitionTime)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(fitToScale)
            .translate(translateX, translateY),
        );
    }
  };


  const resetDefaultNodes = () => {
    const previousPositions = config.defaultNodePositions;
    showEle.nodes.map((m) => {
      const previousNode = previousPositions[m.id];
      m.x = previousNode.x;
      m.y = previousNode.y;
    })
  }

  const labelStyle = {
    fontFamily: "Lato",
    fontSize: 8,
    align: "left",
    fill: labelColor,
  };

  if (!initial) {
    if (config.currentLayout === "default") {
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
    console.log("simulation finished");
    simulation.stop();
    if (config.graphDataType === "parameter") {
      const defaultNodePositions = showEle.nodes.reduce((acc, node) => {
        acc[node.id] = { x: node.x, y: node.y };
        return acc
      }, {})
      config.setDefaultNodePositions(defaultNodePositions)
    }
    updatePositions(true);
  }

  // Update search box with searchable items
  updateSearch(showEle.nodes, graph, "");
  updateSearch(showEle.nodes, graph, "-sp-end")
  updateButtons(graph);

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

    let totalDepth = getMax("inbound") + getMax("outbound");
    totalDepth = totalDepth === 0 ? 1 : totalDepth;
    const getHierarchy = (parentId, id, direction, rootLink) =>  d3
      .stratify()
      .parentId((d) => d[parentId])
      .id((d) => d[id])(
        rootLink.concat(
          nnLinks.filter((f) => f.direction === direction)
        )
      )
    const radiusMultiple = 2.2;
    const inboundRootLink = [{ target: "", source: config.nearestNeighbourOrigin }];
    const inboundHierarchy = getHierarchy("target","source","inbound",inboundRootLink);

    const outboundRootLink = [{ source: "", target: config.nearestNeighbourOrigin }];
    const outboundHierarchy = getHierarchy("source","target","outbound",outboundRootLink);

    const radiusByDepthDirection = nnLinks.reduce((acc, link) => {
      const depthDirection = `${link.depth}-${link.direction}`;
      if(!acc[depthDirection]){acc[depthDirection] = 0};
      const matchingNode = showEle.nodes.find((f) => f.NAME === link[link.direction === "outbound" ? "source" : "target"]);
      acc[depthDirection] += (matchingNode.radius * radiusMultiple);
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
    const dy = visibleWidth  / totalDepth;

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
    const groupsWithHeightInRange = nodesByColumn.filter((f) => f[1].length > 1 && d3.sum(f[1], (s) => s.radius * radiusMultiple) < height);
    groupsWithHeightInRange.forEach((group) => {
      let currentY = -(d3.sum(group[1], (s) => s.radius * radiusMultiple))/2;
      group[1].forEach((node) => {
        node.y = currentY + node.radius;
        currentY += (node.radius *radiusMultiple);
      })
    })

    if(maxColumnRadius > height){
      // now the simulation part
      const ySimulation = d3.forceSimulation()
        .alphaDecay(0.1)
        .force('x', d3.forceX((d) => d.x).strength(0.8))
        .force('y', d3.forceY((d) => d.y).strength(0.8))
        .force('collide', d3.forceCollide().radius((d) => d.radius * (radiusMultiple/2)).strength(0.6));
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
      let nodeGap = 100;
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
    } else if(expandedAll){
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

    const getTooltipNode = () => {
      const singleNode = config.selectedNodeNames.length === 1;
      // passing in single node if only one selected - undefined otherwise as unused
      return  singleNode ? showEle.nodes.find((f) => f.NAME === config.selectedNodeNames[0]) : undefined;
    }
    d3.select(".animation-container").style("display","none");
    let chartNodes = showEle.nodes;

    if(config.currentLayout !== "default"){
      const validNN = config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin !== "";
      const validSP = config.currentLayout === "shortestPath" && (config.shortestPathStart !== "" && config.shortestPathEnd !== "");
      if(validNN || validSP){
        chartNodes = showEle.nodes.reduce((acc,node) => {
          const matchingNode = config.notDefaultSelectedNodeNames.find((f) => f.name === node.NAME);
          if(matchingNode){
            node.x = matchingNode.x;
            node.y = matchingNode.y;
            acc.push(node);
          }
          return acc;
        },[]);
      } else {
        chartNodes = [];
      }
    }
    if(!config.showSingleNodes && config.currentLayout === "default"){
      chartNodes = chartNodes.filter((f) => f.radiusVar > 0);
    }

    expandedAll = chartNodes.length === config.selectedNodeNames.length;

    const chartLinks = chartNodes.length === showEle.nodes.length ? showEle.links :
      showEle.links.filter((f) =>
      chartNodes.some((s) => s.NAME === getSourceId(f)) &&
      chartNodes.some((s) => s.NAME === getTargetId(f)));

    const getNodeAlpha = (nodeName, linkCount,label) => {
      if(expandedAll || config.currentLayout !== "default") return 1;
      if(config.selectedNodeNames.includes(nodeName)) return nodeFillOpacity;
      return label ? 0 : 0.2;
    }

    const checkLinkSelected = (link) => config.currentLayout === "default" &&
      config.selectedNodeNames.includes(getSourceId(link)) &&
      config.selectedNodeNames.includes(getTargetId(link))

    const getLinkAlpha = (link, linkLength) => {
      const linkOpacity = linkLength > 100 ? 0.4 : 0.6;
      if(expandedAll || config.currentLayout !== "default") return linkOpacity;
      if(checkLinkSelected(link)) return linkOpacity;
      return 0.05;
    }

    // need to add arrows
    const linksGroup = svg.select(".linkGroup")
      .selectAll(".linksGroup")
      .data(chartLinks)
      .join((group) => {
        const enter = group.append("g").attr("class", "linksGroup");
        enter.append("path").attr("class", "linkPathForArrows");
        enter.append("path").attr("class", "linkPath");
        return enter;
      });

    const getLinkPath = (d, i) => {
      const path = d3.select(`#arrowLinkPath${i}`).node();
      const totalLength = path.getTotalLength();
      const start = path.getPointAtLength(d.source.radius + 2);
      const end = path.getPointAtLength(totalLength - (d.target.radius + 2));
      return `M${start.x},${start.y},L${end.x},${end.y}`
    }

    linksGroup
      .select(".linkPathForArrows")
      .attr("id", (d,i) => `arrowLinkPath${i}`)
      .attr("pointer-events", "none")
      .attr("stroke", "transparent")
      .attr("fill","none")
      .attr("d", (d) => `M${d.source.x},${d.source.y},L${d.target.x},${d.target.y}`)


    linksGroup
      .select(".linkPath")
      .attr("pointer-events", "none")
      .attr("stroke-opacity", (d) => getLinkAlpha(d,chartLinks.length))
      .attr("stroke-width", 0.5)
      .attr("stroke", linkStroke)
      .attr("fill","none");

    d3.selectAll(".linkPath")
      .attr("d", getLinkPath)
      .attr("marker-start",(d) => checkLinkSelected(d) &&  d.direction === "both" && config.showArrows  ? "url(#arrowPathStart)" : "")
      .attr("marker-end",(d) => checkLinkSelected(d) && config.showArrows  ? "url(#arrowPathEnd)" : "")

    const dragged = (event, node) => {
      node.x = event.x;
      node.y = event.y;
      d3.selectAll(".nodesGroup")
        .filter((f) => f.id === node.id)
        .attr("transform",  `translate(${event.x},${event.y})`);
      updatePositions();
    }


    const nodesGroup = svg.select(".nodeGroup")
      .selectAll(".nodesGroup")
      .data(chartNodes, (d) => d.id)
      .join((group) => {
        const enter = group.append("g").attr("class", "nodesGroup");
        enter.append("circle").attr("class", "nodeCircle");
        enter.append("text").attr("class", "nodeLabel");
        return enter;
      });

    nodesGroup.attr("transform", (d) => `translate(${d.x},${d.y})`)
      .call(d3.drag()
        .on("drag", dragged))
      .on("mouseover",(event,d) => {
        d3.select(event.currentTarget).select(".nodeCircle").attr("fill", "white");
        if(config.currentLayout === "default"){
          updateTooltip(d, true, event.x);
        }
        if(config.graphDataType !== "parameter"){
          const currentNodeId = d.id;
          svg.selectAll(".linkPath").attr("stroke-opacity", 0.05);
          svg.selectAll(".nodeCircle").attr("opacity",0.2);
          svg.selectAll(".linkPath")
            .filter((f) => f.source.id === currentNodeId || f.target.id === currentNodeId)
            .each((d,i,objects) => {
              const opposite = d.source.id === currentNodeId ? d.target.id : d.source.id;
              svg.selectAll(".nodeCircle")
                .filter((f) =>  f.id === opposite || f.id === currentNodeId)
                .attr("opacity",1);
              d3.select(objects[i])
                .attr("marker-start", d.direction === "both"  ? "url(#arrowPathStart)" : "")
                .attr("marker-end","url(#arrowPathEnd)")
                .attr("stroke-opacity",0.5);
            })

        }
      })
      .on("mouseout", (event,d) => {
        d3.selectAll(".nodeCircle").attr("fill", (d) => d.color);
        if(config.graphDataType === "parameter"){
          if(expandedAll && config.currentLayout === "default"){
            tooltip.style("visibility", "hidden");
          } else {
            const tooltipNode = getTooltipNode();
            updateTooltip(tooltipNode, false, event.x);
          }
        } else {
          svg.selectAll(".linkPath")
            .attr("marker-start",  "")
            .attr("marker-end","")
            .attr("stroke-opacity", 0.5);
          svg.selectAll(".nodeCircle").attr("opacity",1);
        }
      })
      .on("click", (event, d) => {
        if (event.defaultPrevented) return; // dragged
        if(config.currentLayout === "default"){
          d3.select(event.currentTarget).raise();
          clickNode(d.NAME, "node", graph)
        }
      })

    nodesGroup
      .select(".nodeCircle")
      .attr("opacity", (d) => getNodeAlpha(d.NAME, d.radiusVar,false))
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("stroke-width", nodeStrokeWidth)
      .attr("stroke", nodeStroke);

    nodesGroup
      .select(".nodeLabel")
      .style("display",config.currentLayout !== "default" || config.graphDataType !== "parameter" || currentZoomLevel > 3 ? "block":"none")
      .attr("text-anchor", "middle")
      .attr("dy",(d) => d.radius + 5)
      .attr("fill", "white")
      .attr("font-size",6)
      .text((d) => d.NAME);


    // need to reset zoom to bounds if going ahead with d3
    if(zoomToBounds){
      performZoomAction(chartNodes,400,"zoomFit")
    }

    const tooltipNode = getTooltipNode();

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
        const { x: cx, y: cy } = centroids.get(d.subModule);
        d.vx -= (d.x - cx) * l;
        d.vy -= (d.y - cy) * l;
      }
    }
    force.initialize = (_) => (nodes = _);
    force.strength = function (_) {
      return arguments.length ? ((strength = +_), force) : strength;
    };
    return force;
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
        tooltip.style("padding","1px")
        const tableStart = `<table style='font-size: 11px; border-collapse: collapse;  width: 100%;'><thead><tr>${config.graphDataType === "parameter" ? "<th style='width:45%;'>SUBMODULE-SEGMENT</th>" : ""}<th style='width:50%;'>NAME</th><th style='width:5%'></th></tr></thead><tbody>`
        content.push(tableStart);
        let nodeRows = []
        listToShow.forEach((d,i) => {
          const nodeName = typeof  d === "string" ? d : d.name;
          const matchingNode = showEle.nodes.find((f) => f.NAME === nodeName);
          if(matchingNode){
            nodeRows.push({row: `<tr>${config.graphDataType === "parameter" ? `<td style='background-color:${matchingNode.color}; color: white; width:50%;'>${matchingNode.SUBMODULE_NAME} - ${matchingNode.SEGMENT_NAME}</td>`: ""}<td class="nodeTableRow" id='nodeTableRow${i}' style="width:50%;">${nodeName}</td><td style='width:5%'> <i class='fas fa-trash'></i></td></tr>`, subModule: matchingNode.SUBMODULE_NAME, name: matchingNode.NAME}); // tooltip title
            nodeTableMapper[`nodeTableRow${i}`] = matchingNode["Parameter Explanation"];
          } else {
            console.log(`issue with ${d}`)
          }
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
      .style("top", 5 + "px") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", tooltipLeft + "px")
      .style("visibility", (config.graphDataType !== "parameter" && !mouseover) || (expandedAll && !mouseover) || listToShow.length === 0 ? "hidden" :"visible");

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
          performZoomAction(showEle.nodes, 500,"zoomIn")
        } else if(buttonId === "zoom-out"){
          performZoomAction(showEle.nodes, 500,"zoomOut")
        } else{
          performZoomAction(showEle.nodes, 500,"zoomFit");
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
          config.notDefaultSelectedNodeNames.forEach((node) => {
          if(!config.selectedNodeNames.some((s) => s === node.name)){
            config.selectedNodeNames.push(node.name);
          }
          })
          d3.select("#view").style("display","block");
          d3.select("#tabbed-component").classed("hidden",window.innerWidth < 1000);
          d3.select("#showInfo").classed("hidden",window.innerWidth >= 1000);
          d3.select("#hideInfo").classed("hidden",window.innerWidth < 1000);
          d3.selectAll(".viewButton").style("opacity",1);
          d3.select("#nnDegreeDiv").style("display","none");
          d3.selectAll("#search-input").attr("placeholder","Search for variables");
          d3.select("#hide-single-button").style("cursor","pointer").attr("disabled",false);
          d3.select('#search-container-sp-end').style("display","none");
          resetDefaultNodes();
          updatePositions(true);
      } else {
        config.setNotDefaultSelectedNodeNames([]);
        config.setNotDefaultSelectedLinks([]);
        d3.select("#view").style("display","none");
        d3.select("#tabbed-component").classed("hidden",true);
        d3.selectAll(".viewButton").style("opacity",0);
        d3.select("#hide-single-button").style("cursor","not-allowed").attr("disabled",true);
        if(config.currentLayout === "nearestNeighbour"){
          if(config.selectedNodeNames.length > 0){
            config.nearestNeighbourOrigin = config.selectedNodeNames[0];
            positionNearestNeighbours(graph);
          } else {
            updatePositions();
          }
          d3.select('#search-container-sp-end').style("display","none");
          d3.select("#nnDegreeDiv").style("display","block");
          d3.select("#search-tab-container").style("height","110px");
          d3.selectAll("#search-input")
            .attr("placeholder","Search for origin node")
            .property("value",config.nearestNeighbourOrigin);
        }
        if(config.currentLayout === "shortestPath"){
          if(config.selectedNodeNames.length > 0){
            config.shortestPathStart = config.selectedNodeNames[0];
            if(config.selectedNodeNames.length > 1){
              config.shortestPathEnd = config.selectedNodeNames[1];
              positionShortestPath(graph);
            } else {
              updatePositions()
            }
          }
          d3.select('#search-container-sp-end').style("display","block");
          d3.select("#search-input-sp-end").property("value",config.shortestPathEnd);
          d3.select("#search-tab-container").style("height","120px");
          d3.select("#nnDegreeDiv").style("display","none");
          d3.selectAll("#search-input")
            .attr("placeholder","Search for start node")
            .property("value",config.shortestPathStart);
        }
      }
        layoutOptions.style("color", (d, i, objects) => {
          return config.currentLayout === objects[i].id ? "white" : "#808080";
        })
    });
  }
  function updateSearch(variableData, graph, extraIdString) {

    const searchInput = document.getElementById(`search-input${extraIdString}`);
    const suggestionsContainer = document.getElementById(`suggestions-container${extraIdString}`);

    // Function to filter suggestions based on user input
    const  filterSuggestions = (input) => {
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
    const updateSuggestions = (input) => {
      const filteredSuggestions = filterSuggestions(input);
      suggestionsContainer.innerHTML = "";

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

const initGraphologyGraph = (nodes, links) => {
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

function getSourceId(d) {
  return d.source && (d.source.id ? d.source.id : d.source);
}
function getTargetId(d) {
  return d.target && (d.target.id ? d.target.id : d.target);
}
