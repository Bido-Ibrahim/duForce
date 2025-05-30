import * as d3 from "d3";
import Graph from "graphology";
import Fuse from 'fuse.js'
import { config } from "./config";
import { drawTree, getColorScale, remToPx } from "./tree";
import { MESSAGES, NODE_RADIUS_RANGE, TICK_TIME, TOOLTIP_KEYS } from "./constants";
import { dijkstra } from "graphology-shortest-path";

const resetMenuVisibility = (width) => {
  // called initially and after every layout change (parameter only)
  const hideInfoHidden = d3.select("#hideInfo").classed("hidden");
  d3.select("#infoMessage").style("visibility","hidden");
  d3.select("#tooltipCount").text("");
  d3.select("#parameter-menu").style("display", config.graphDataType === "parameter" ? "block" : "none");
  d3.select("#tabbed-component")
    .classed("hidden",config.graphDataType !== "parameter"
      || (config.graphDataType === "parameter" && config.currentLayout !== "default")
      || (width < 1000 && hideInfoHidden) || hideInfoHidden);
  const parameterOtherPosition = config.currentLayout === "default" ? "2.9rem" : "4.8rem";
  d3.selectAll(".otherButton")
    .style("top", config.graphDataType === "parameter" ? parameterOtherPosition : "1.4rem");
  d3.selectAll(".viewButton")
    .style("opacity",config.graphDataType === "parameter" && config.currentLayout === "default"? 1 : 0)
    .style("top",`${config.graphDataType === "parameter" ? 3.1 : 1.4}rem`);
  let searchTabContainerHeight = "auto";
  if(config.graphDataType === "parameter" && config.currentLayout !== "default"){
    searchTabContainerHeight = "6rem";
  } else if (config.graphDataType !== "parameter"){
    searchTabContainerHeight = "2.5rem";
  } else if (hideInfoHidden){
    searchTabContainerHeight = "4rem";
  }
  d3.select("#search-tab-container").style("height",searchTabContainerHeight);


}
export default async function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector, // id or class selector of DIV to render the graph in
    initial = true,
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels

  } = {}
) {
  if (!nodes) return;
  resetMenuVisibility(width);
  let expandedAll = config.graphDataType !== "parameter" || nodes.length === config.selectedNodeNames.length;
  // data for charts
  const showEle = { nodes, links};
  // calculate linkCount
  const nodeLinkCounts = nodes.reduce((acc, node) => {
    const sourceLinks = links.filter((f) => getSourceId(f) === node.id).length;
    const targetLinks = links.filter((f) => getTargetId(f) === node.id).length;
    acc[node.id] = sourceLinks + targetLinks;
    return acc;
  }, {})

  // set scales
  const radiusMax = config.graphDataType === "parameter" ?
    d3.max(Object.values(nodeLinkCounts)) :
    d3.max(showEle.nodes, (d) => d.data.parameterCount)

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain([0, radiusMax])
    .range(NODE_RADIUS_RANGE)
    .clamp(true);

  const color = getColorScale();

  // add additional node variables
  showEle.nodes = showEle.nodes.reduce((acc, node) => {
    node.radiusVar = config.graphDataType === "parameter" ? nodeLinkCounts[node.id] : node.data.parameterCount;
    node.color = color(config.graphDataType === "parameter" ? node.subModule : node.data.subModule);
    node.radius = nodeRadiusScale(node.radiusVar);
    acc.push(node);
    return acc;
  }, [])


  // select or define non data-appended elements
  let baseSvg = d3.select(containerSelector).select("svg");
  let tooltip = d3.select(containerSelector).select(".tooltip");
  let tooltipExtra = d3.select(containerSelector).select(".tooltipExtra");
  if (baseSvg.node() === null) {
    baseSvg = d3.select(containerSelector).append("svg").attr("class","baseSvg").attr("width", width).attr("height", height);
    const actualSvg = baseSvg.append("g").attr("class", "chartGroup")
    actualSvg.append("g").attr("class", "nnGroup")
    actualSvg.append("g").attr("class", "linkGroup");
    actualSvg.append("g").attr("class", "nodeGroup");
    const defs = actualSvg.append("defs");
    defs.append("marker").attr("class", "markerGroupStart")
      .append("svg:path").attr("class", "markerPathStart");
    defs.append("marker").attr("class", "markerGroupEnd")
      .append("svg:path").attr("class", "markerPathEnd");
    tooltip = d3.select(containerSelector).append("div").attr("class", "tooltip");
    tooltipExtra = d3.select(containerSelector).append("div").attr("class", "tooltipExtra");
  }
  tooltip.style("visibility","hidden");
  tooltipExtra.style("visibility","hidden");

  // graphology component (used for NN and SP)
  const graph = initGraphologyGraph(showEle.nodes, showEle.links);

  const getQuiltMiddleDepthMultiple = (type) => (type === "tier1" ? 8 : type === "tier2" ? 6 : 1.4);
  // Initialize simulation
  const simulation = d3
    .forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id).strength((link) => {
      if(config.graphDataType !== "parameter"){
        return 0
      } // default from https://d3js.org/d3-force/link as distance doesn't matter here
      return 1 / Math.min(link.source.radiusVar, link.target.radiusVar)
    }))
    .force("x", d3.forceX((d) => d.x ? d.x : 0).strength(config.graphDataType === "parameter" ? 0.1 : 0.2))
    .force("y", d3.forceY((d) => d.y ? d.y : 0).strength(config.graphDataType === "parameter" ? 0.1 : 0.2))
    .force("collide", d3.forceCollide() // change segment when ready
      .radius((d) => config.graphDataType !== "parameter" ? d.radius * getQuiltMiddleDepthMultiple(d.type) : d.radius)
      .strength(0.4)
      .iterations(4)
    ) // change segment when ready
    .force("cluster", forceCluster().strength(config.graphDataType === "parameter" ? 0.45 : 1)) // cluster all nodes belonging to the same submodule.
    // change segment when ready
    .force("charge", d3.forceManyBody().strength(config.graphDataType === "parameter" ? (expandedAll ? -100 : -250) : 0));

  simulation.stop();

  const svg = d3.select(".chartGroup");

  // arrow marker attributes
  svg.select(".markerGroupStart")
    .attr("id", "arrowPathStart")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 5)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathStart")
    .attr("fill", "#606060")
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
    .attr("fill", "#606060")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M1, -4L9,0L1,4") // M9,-4L1,0L9,4 (start)

  // zoom and zoom functions
  let currentZoomLevel = 1;

  // node visibility can depend on zoom level
  const getNodeLabelDisplay = (d) => {
    if((config.graphDataType !== "parameter" && d.type !== "tier3") || config.currentLayout === "shortestPath") return "block";
    if(config.currentLayout === "nearestNeighbour") return "block";
    if(config.currentLayout === "default" && !expandedAll) {
      return config.selectedNodeNames.includes(d.id) ? "block" : "none";
    }
    return currentZoomLevel > 2 ? "block":"none";
  }

  const zoom = d3
    .zoom()
    .on("zoom", (event) => {
      const { x, y, k } = event.transform;
      currentZoomLevel = k;
      svg.attr("transform", `translate(${x},${y}) scale(${k})`);
      svg.selectAll(".nodeLabel").style("display",getNodeLabelDisplay);

    });

  baseSvg.call(zoom).on("dblclick.zoom", null);

  const getZoomCalculations = (currentNodes) => {

    const [xExtent0, xExtent1] = d3.extent(currentNodes, (d) => d.fx || d.x);
    // using === undefined here as it's valid when the extent = 0;
    if(xExtent0 === undefined || xExtent1 === undefined) return {translateX: 0, translateY: 0, fitToScale: 1};
    const [yExtent0, yExtent1] = d3.extent(currentNodes, (d) => d.fy || d.y);
    if(yExtent0 === undefined || yExtent1 === undefined) return {translateX: 0, translateY: 0, fitToScale: 1};
    let xWidth = xExtent1 - xExtent0 + (currentNodes.length === 1 ? 250 : 100);
    let yWidth = yExtent1 - yExtent0 + (currentNodes.length === 1 ? 250 : 100);

    const translateX = -(xExtent0 + xExtent1) / 2;
    const translateY = -(yExtent0 + yExtent1) / 2 + (config.currentLayout === "nearestNeighbour" ? 30 : 0);
    const fitToScale = 0.95 / Math.max(xWidth / width, yWidth / height);
    return {translateX, translateY, fitToScale};
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
            .scale(1)
            .translate(width / 2, height / 2)
            .scale(fitToScale)
            .translate(translateX,  translateY)
        );
    }
  };
  const resetDefaultNodes = () => {
    // uses positions recorded from initial default build to reset the positions
    const previousPositions = config.defaultNodePositions;
    showEle.nodes.map((m) => {
      const previousNode = previousPositions[m.id];
      m.x = previousNode.x;
      m.y = previousNode.y;
    })
  }
  // radio buttons on toolbar if NN
  const activateTooltipToggle = () => {
    d3.selectAll(".directionToggle")
      .on("change", (event) => {
        config.setTooltipRadio(event.currentTarget.value);
        updatePositions(true);
      })
  }

  if (!initial && !(config.currentLayout === "default" && config.defaultNodePositions.length === 0)) {
    if (config.currentLayout === "default") {
      resetDefaultNodes();
    }
    updatePositions(true);
  } else {
    // initial build
    // set links
    simulation.nodes(showEle.nodes).force("link").links(showEle.links);
    // restart simulation
    simulation.alphaTarget(0.1).restart();
     // stop at calculated tick time (from previous dev)
    simulation.tick(TICK_TIME);
    // stop simulation
    simulation.stop();
    if (config.graphDataType === "parameter") {
      // store positions for next time
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
  updateSearch(showEle.nodes, graph, "-sp-end");
  // updateButtons
  updateButtons(graph);

  // nearest neighbour functions
  const getNeighbours =(nameArray, direction, nnDepth, previousNNNodes) =>  nameArray.reduce((acc, origin) => {

    const neighbourLinks = showEle.links.filter((f) => (direction === "outbound" ? getSourceId(f) : getTargetId(f)) === origin)
    neighbourLinks.forEach((d) => {
      const source = getSourceId(d);
      const target = getTargetId(d);
      const oppositeNode = source === origin ? target : source;
      if(!previousNNNodes.includes(oppositeNode) && !acc.some((s) => s.node === oppositeNode)){
        acc.push({
          source, target, direction,depth: nnDepth, node: oppositeNode
        })
      }
    })
     return acc;
    }, [])

  const getNearestNeighbourLinks = () => {
    const depth1OutboundLinks = getNeighbours([config.nearestNeighbourOrigin], "outbound",1,[]);
    const depth1InboundLinks = getNeighbours([config.nearestNeighbourOrigin],"inbound",1,[]);
    const depth1Links = depth1OutboundLinks.concat(depth1InboundLinks);
    if(config.nearestNeighbourDegree > 1 && depth1Links.length > 0){
      const depth1NodeNames = [config.nearestNeighbourOrigin].concat(depth1Links.map((m) => m.node));
      const depth2OutboundLinks = getNeighbours(depth1OutboundLinks.map((m) => m.node),"outbound",2,depth1NodeNames);
      const depth2InboundLinks = getNeighbours( depth1InboundLinks.map((m) => m.node),"inbound",2,depth1NodeNames);
      const depth2Links = depth2OutboundLinks.concat(depth2InboundLinks);
      if(config.nearestNeighbourDegree > 2 && depth2Links.length > 0){
        const depth2NodeNames = depth1NodeNames.concat(depth2Links.map((m) => m.node));
        const depth3OutboundLinks = getNeighbours(depth2OutboundLinks.map((m) => m.node),"outbound",3,depth2NodeNames);
        const depth3InboundLinks = getNeighbours( depth2InboundLinks.map((m) => m.node),"inbound",3,depth2NodeNames);
        const depth3Links = depth3OutboundLinks.concat(depth3InboundLinks);
        return depth1Links.concat(depth2Links).concat(depth3Links);
      }
      return depth1Links.concat(depth2Links);
    }
    return depth1Links
  }

  const generateSymmetricNNArray = () => {
    // get title array for NN label titles
    const arr = [];
    for (let i = config.nearestNeighbourDegree; i > 0; i--) {
      arr.push({type: "driver",level: i});
    }
    arr.push({type: "root", level: 0});
    for (let i = 1; i <= config.nearestNeighbourDegree; i++) {
      arr.push({type: "outcome",level: i});
    }
    return arr;
  }

  const renderNNLevelLabels = (nnData) => {

    // render (or unrenders) the level titles
    const nnWidth = 200;
    const nnHeight = 1000;

    // need to add arrows
    const nnLabelGroup = svg.select(".nnGroup")
      .selectAll(".nnLabelGroup")
      .data(nnData)
      .join((group) => {
        const enter = group.append("g").attr("class", "nnLabelGroup");
        enter.append("text").attr("class", "nnLabelType");
        enter.append("text").attr("class", "nnLabelLevel");
        return enter;
      });

    nnLabelGroup.attr("transform",(d,i) => `translate(${i * nnWidth},${-remToPx(4)})`)

    nnLabelGroup.select(".nnLabelType")
      .attr("x", nnWidth/2)
      .attr("y",0)
      .attr("font-size","1rem")
      .attr("text-anchor", "middle")
      .attr("fill","white")
      .text((d) => d.type.toUpperCase());

    nnLabelGroup.select(".nnLabelLevel")
      .attr("x", nnWidth/2)
      .attr("y","1em")
      .attr("font-size","0.7rem")
      .attr("text-anchor", "middle")
      .attr("fill","white")
      .text((d) => `${d.level > 0 ? `Level ${d.level}`: ""}`);

    return {nnWidth, nnHeight};
  }
  function positionNearestNeighbours(nodeClick) {
    // reset links and nodes
    config.setNotDefaultSelectedLinks([]);
    config.setNotDefaultSelectedNodeNames([]);
    // render titles
    const {nnWidth, nnHeight} = renderNNLevelLabels(nodeClick ? [] : generateSymmetricNNArray());
    // get the links
    const nnLinks = getNearestNeighbourLinks();

    const getNNHierarchy = (parentId, id, direction, rootLink) =>  d3
      .stratify()
      .parentId((d) => d[parentId])
      .id((d) => d[id])(
        rootLink.concat(
          nnLinks.filter((f) => f.direction === direction)
        )
      )

    // using d3.tree() to build the positions for inbound and outbound nodes
    // so first step is to build the data for these 2 trees
    const radiusMultiple = 2.4;
    const inboundRootLink = [{ target: "", source: config.nearestNeighbourOrigin }];
    const inboundHierarchy = getNNHierarchy("target","source","inbound",inboundRootLink);

    const outboundRootLink = [{ source: "", target: config.nearestNeighbourOrigin }];
    const outboundHierarchy = getNNHierarchy("source","target","outbound",outboundRootLink);

    // calculate the maximum column radius for each depth direction
    const radiusByDepthDirection = nnLinks.reduce((acc, link) => {
      const depthDirection = `${link.depth}-${link.direction}`;
      if(!acc[depthDirection]){acc[depthDirection] = 0};
      const matchingNode = showEle.nodes.find((f) => f.NAME === link[link.direction === "outbound" ? "source" : "target"]);
      acc[depthDirection] += (matchingNode.radius * radiusMultiple);
      return acc;
    },{})

    const maxColumnRadius = nnLinks.length === 0 ? 0 : d3.max(Object.values(radiusByDepthDirection));

    const getNNTree = (hierarchy, treeWidth) =>  d3
      .tree()
      .size([nnHeight * 0.9, treeWidth])(hierarchy)
      .descendants()
      .filter((f) => f.depth > 0)

    const getNNLinks = (node) => {
      const nnLinkIds = node.descendants().map((m) => m.id);
      node.ancestors().forEach((d) => {
        if(!nnLinkIds.some((s) => s === d.id)){
          nnLinkIds.push(d.id)
        }
      });
      return nnLinkIds;
    }
    const maxInDepth = d3.max(inboundHierarchy, (d) => d.depth);
    const maxOutDepth = d3.max(outboundHierarchy, (d) => d.depth);
    const shiftRight = (config.nearestNeighbourDegree + 0.5) * nnWidth;

    // use new data and tree definition to build the data
    const getAllNodePositions = () => {
      const centralNodes = [{
        name: config.nearestNeighbourOrigin,
        x: shiftRight,
        y: 0,
        direction: "center",
        depth: 0,
        nnLinkIds: getNNLinks(inboundHierarchy).concat(getNNLinks(outboundHierarchy))
      }];
      const inboundNodes = getNNTree(inboundHierarchy, nnWidth * maxInDepth).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: -node.y + shiftRight,
          y: node.x,
          direction: "in",
          depth: node.depth,
          nnLinkIds: getNNLinks(node)
        });
        return acc;
      }, []);
      const outboundNodes = getNNTree(outboundHierarchy,nnWidth * maxOutDepth).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: node.y + shiftRight,
          y: node.x,
          direction: "out",
          depth: node.depth,
          nnLinkIds: getNNLinks(node)
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

    // get node positions using the custom trees
    const allNNNodes = getAllNodePositions();
    const nodesByColumn = Array.from(d3.group(allNNNodes, (g) => `${g.direction}-${g.depth}`));
    // use generated trees to get the height and stack the nodes vertically
    const groupsWithHeightInRange = nodesByColumn.filter((f) => f[1].length > 1 && d3.sum(f[1], (s) => s.radius * radiusMultiple) < height);
    groupsWithHeightInRange.forEach((group) => {
      let currentY = 0;
      group[1].forEach((node) => {
        node.y = currentY + node.radius;
        currentY += (node.radius *radiusMultiple);
      })
    })

    if(maxColumnRadius > height){
      // if there are too many nodes to stack vertically, apply a quick simulation which moves them around
      // so they don't collide
      const ySimulation = d3.forceSimulation()
        .alphaDecay(0.1)
        .force('x', d3.forceX((d) => d.x).strength(0.8))
        .force('y', d3.forceY((d) => d.y).strength(0.8))
        .force('collide', d3.forceCollide().radius((d) => d.radius * (radiusMultiple/2)).strength(0.6));
      ySimulation.stop();
      ySimulation.nodes(allNNNodes);
      ySimulation.tick(300);
    }

    // set the links and nodes
    config.setNotDefaultSelectedLinks(nnLinks);
    config.setNotDefaultSelectedNodeNames(allNNNodes);
    if(nodeClick){
      // if from default view, set's selectedNodeNames
      config.setSelectedNodeNames(allNNNodes.map((m) => m.name));
    }

    updatePositions(true,nodeClick);
  }

  // shortest path functions
  function positionShortestPath (graph) {
    // clear data
    config.setNotDefaultSelectedNodeNames([]);
    config.setNotDefaultSelectedLinks([]);
    // search for connections between the two nodes
    const connectedNodes = dijkstra.bidirectional(graph, config.shortestPathStart, config.shortestPathEnd);
    if(connectedNodes){
      // if results build the links
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
      // now build the nodes
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
      // set the data
      config.setNotDefaultSelectedLinks(connectedLinks);
      config.setNotDefaultSelectedNodeNames(connectedChartNodes);
    } else {
      // no connections, clear data
      d3.select("#infoMessage").text(MESSAGES.noSP).style("visibility","visible");
      config.setNotDefaultSelectedLinks([]);
      config.setNotDefaultSelectedNodeNames([]);
    }
    updatePositions(true);
  }

  // node click
  function clickNode (nodeName,origin, graph){
    // reset background circle and infoMessage
    d3.selectAll(".nodeBackgroundCircle").attr("stroke-width",0);
    d3.select("#infoMessage").style("visibility","hidden");
    if(origin === "search" && config.currentLayout === "nearestNeighbour"){
      // layout NN search
      config.setNearestNeighbourOrigin(nodeName);
      positionNearestNeighbours(false);
    } else if (config.currentLayout === "shortestPath") {
      // layout SP search
      if(origin === "search"){
        config.setShortestPathStart(nodeName);
      } else {
        config.setShortestPathEnd(nodeName);
      }
      if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
        positionShortestPath(graph);
      }
    } else if (config.currentLayout === "default" ) {
      // whether from search box or node name
      // required behaviour is NN degree 1
      config.setNearestNeighbourOrigin(nodeName);
      config.setSelectedNodeNames([]);
      config.setNearestNeighbourDegree(1);
      d3.select("#search-input").property("value",nodeName)
      positionNearestNeighbours(true);
    }
    // otherwise do nothing - no current click action for submodule or segment
  }



  // Update coordinates of all nodes + links based on current config settings
  function updatePositions(zoomToBounds, fromNearestNeighbourDefaultNodeClick) {

    // redraw tree if needed
    if(config.graphDataType === "parameter" && config.currentLayout === "default"){
      drawTree();
    }
    // function used on node mouseover to populate tooltip + @ end of updatePositions
    const getTooltipNode = () => {
      const singleNode = config.selectedNodeNames.length === 1;
      // passing in single node if only one selected - undefined otherwise as unused
      return  singleNode ? showEle.nodes.find((f) => f.NAME === config.selectedNodeNames[0]) : undefined;
    }

    // set chartNodes
    let chartNodes = showEle.nodes;
    if(config.currentLayout !== "default" && config.graphDataType === "parameter"){
      // if layout is NN or SP map nodes from notDefaultSelectedNodeNames
      const validNN = config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin !== "";
      const validSP = config.currentLayout === "shortestPath" && (config.shortestPathStart !== "" && config.shortestPathEnd !== "");
      if(validNN || validSP){
        showEle.nodes.map((m) => m.direction = undefined);
        chartNodes = showEle.nodes.reduce((acc,node) => {
          const matchingNode = config.notDefaultSelectedNodeNames.find((f) => f.name === node.NAME);
          if(matchingNode){
            node.x = matchingNode.x;
            node.y = matchingNode.y;
            node.nnLinkIds = matchingNode.nnLinkIds;
            acc.push(node);
          }
          return acc;
        },[]);
      } else {
        chartNodes = [];
      }
    }
    // filter out single if requested
    if(!config.showSingleNodes && config.currentLayout === "default"){
      chartNodes = chartNodes.filter((f) => f.radiusVar > 0);
    }
    if(config.tooltipRadio !== "none"  && config.nearestNeighbourOrigin !== ""){
      // for NN searches (default + nearestNeighbour layout) radio appears @ top of tooltip
      // apply filters if needed
      if(config.tooltipRadio === "both"){
        config.setSelectedNodeNames(config.notDefaultSelectedNodeNames.map((m) => m.name));
      } else if (config.tooltipRadio === "in"){
        const filteredNodeNames = config.notDefaultSelectedNodeNames
          .filter((f) => f.direction === "in" || f.direction === "center")
          .map((m) => m.name);
        config.setSelectedNodeNames(filteredNodeNames);
      } else {
        const filteredNodeNames = config.notDefaultSelectedNodeNames
          .filter((f) => f.direction === "out" || f.direction === "center")
          .map((m) => m.name);
        config.setSelectedNodeNames(filteredNodeNames);
      }
    }
    // reset expandedAll
    expandedAll = config.graphDataType !== "parameter" || showEle.nodes.length === config.selectedNodeNames.length;
    // and reset button
    d3.select("#resetButton")
      .text(config.graphDataType !== "parameter" || config.currentLayout !== "default" || expandedAll ? "" : "Reset");

    // now get the links
    let chartLinks = showEle.links;
    // filter if NN or not expandedAll
    if(fromNearestNeighbourDefaultNodeClick || config.tooltipRadio !== "none"){
      chartLinks = showEle.links.filter((f) => config.notDefaultSelectedLinks
        .some((s) => s.source === getSourceId(f) && s.target === getTargetId(f)));
    } else if (chartNodes.length !== showEle.nodes.length){
       chartLinks = showEle.links.filter((f) =>
         chartNodes.some((s) => s.NAME === getSourceId(f)) &&
         chartNodes.some((s) => s.NAME === getTargetId(f)));
    }

    if(config.graphDataType !== "parameter"){
      chartLinks = config.hierarchyData.allLinks.reduce((acc, link, index) => {
        if(showEle.nodes.some((s) => s.id === link.source) && showEle.nodes.some((s) => s.id === link.target)){
          if(!acc.some((s) => (s.source === link.source && s.target === link.target) || (s.source === link.target && s.target === link.source)))
          acc.push({
            source: link.source,
            target: link.target,
            direction: link.direction,
            index
          })
        }
        return acc;
      },[])
      simulation.nodes([]).force("link").links([])
      simulation.nodes(showEle.nodes).force("link").links(chartLinks);
      simulation.alphaTarget(0.1).restart();
      // stop at calculated tick time (from previous dev)
      simulation.tick(TICK_TIME);
      // stop simulation
      simulation.stop();

    }

    // functions for defining link attributes
    const checkLinkSelected = (link) => {
      if(config.currentLayout === "default" && config.graphDataType === "parameter"){
        return config.selectedNodeNames.includes(getSourceId(link)) &&
          config.selectedNodeNames.includes(getTargetId(link))
      }
      return true;
    }

    const getLinkAlpha = (link, linkLength) => {
      const linkOpacity = linkLength > 100 ? 0.3 : 0.6;
      if(expandedAll || config.currentLayout !== "default" || config.graphDataType !== "parameter") return linkOpacity;
      if(checkLinkSelected(link)) return linkOpacity;
      return 0.05;
    }

    const getLinkPath = (d) => {
      // custom path to account for source + target radii so arrows will be visible
      const path = d3.select(`#arrowLinkPath${d.index}`).node();
      if(path){
        const totalLength = path.getTotalLength();
        const start = path.getPointAtLength(d.source.radius + 2);
        const end = path.getPointAtLength(totalLength - (d.target.radius + 2));
        return `M${start.x},${start.y},L${end.x},${end.y}`
      }
      return "";
    }

    // append chartLinks to linksGroup and define attributes
    const linksGroup = svg.select(".linkGroup")
      .selectAll(".linksGroup")
      .data(chartLinks)
      .join((group) => {
        const enter = group.append("g").attr("class", "linksGroup");
        enter.append("path").attr("class", "allLinkPaths linkPathForArrows");
        enter.append("path").attr("class", "allLinkPaths linkPath");
        return enter;
      });

    // standard link which to create custom path in getLinkPath
    linksGroup
      .select(".linkPathForArrows")
      .attr("id", (d) => `arrowLinkPath${d.index}`)
      .attr("pointer-events", "none")
      .attr("stroke", "transparent")
      .attr("fill","none")
      .attr("d", (d) => `M${d.source.x},${d.source.y},L${d.target.x},${d.target.y}`)

    // visible link
    linksGroup
      .select(".linkPath")
      .attr("pointer-events", "none")
      .attr("stroke-opacity", (d) => getLinkAlpha(d,chartLinks.length))
      .attr("stroke-width", 0.5)
      .attr("stroke", "#A0A0A0")
      .attr("fill","none");

    // adding arrows after link and standard link are rendered
    d3.selectAll(".linkPath")
      .attr("d", getLinkPath)
      .attr("marker-start",(d) => checkLinkSelected(d) &&  d.direction === "both" && config.showArrows  ? "url(#arrowPathStart)" : "")
      .attr("marker-end",(d) => checkLinkSelected(d) && config.showArrows  ? "url(#arrowPathEnd)" : "")

    // functions for defining node attributes + functionality
    const getNodeAlpha = (nodeName, linkCount,label) => {
      if(expandedAll || config.currentLayout !== "default" || config.selectedNodeNames.includes(nodeName)) return 1;
      return label ? 0 : 0.2;
    }

    const dragged = (event, node) => {
      // resetting data for affected nodes only rather than running updatePositions again
      // because render time was so much faster
      // reset node data
      node.x = event.x;
      node.y = event.y;
      // filter and position nodes
      d3.selectAll(".nodesGroup")
        .filter((f) => f.id === node.id)
        .attr("transform",  `translate(${event.x},${event.y})`);

      // reset link data
      d3.selectAll(".linksGroup")
        .filter((f) => f.source.id === node.id || f.target.id === node.id)
        .each((d) => {
          if(d.source.id === node.id){
            d.source.x = event.x;
            d.source.y = event.y;
          } else {
            d.target.x = event.x;
            d.target.y = event.y;
          }
        })

      // filter and position links
      d3.selectAll(".linkPathForArrows")
        .filter((f) => f.source.id === node.id || f.target.id === node.id)
        .attr("d", (d) => `M${d.source.x},${d.source.y},L${d.target.x},${d.target.y}`)

        d3.selectAll(".linkPath")
        .attr("d", getLinkPath);
    }

    const quiltOrMiddleHighlight = (d) => {
      // highlight adjoining links and nodes when in config.graphDataType === "submodule" (Quilt) or "segment" (middle)
      const currentNodeId = d.id;
      // tone down links, nodes and remove paths
      svg.selectAll(".allLinkPaths").attr("stroke-opacity", 0.05);
      svg.selectAll(".nodeCircle").attr("opacity",0.2);

      svg.selectAll(".allLinkPaths")
        .attr("marker-start","")
        .attr("marker-end","")
        .filter((f) => f.source.id === currentNodeId || f.target.id === currentNodeId)
        // after filter, highlight adjoining links and nodes
        .each((d,i,objects) => {
          const opposite = d.source.id === currentNodeId ? d.target.id : d.source.id;
          svg.selectAll(".nodeCircle")
            .filter((f) =>  f.id === opposite || f.id === currentNodeId)
            .attr("opacity",1);
          d3.select(objects[i])
            .attr("marker-start", (n) => n.direction === "both"  ? "url(#arrowPathStart)" : "")
            .attr("marker-end","url(#arrowPathEnd)")
            .attr("stroke-opacity",0.5);
        })
    };

    const allNodeMouseout = () => {
      // reset nodes and links after a mouseout
      d3.selectAll(".nodeCircle")
        .attr("stroke-width", 0)
        .attr("opacity",(d) =>
          config.graphDataType !== "parameter" || config.currentLayout !== "default" ? 1 :
            config.selectedNodeNames.includes(d.id) ? 1 : 0.2);
      svg.selectAll(".linkPath")
        .attr("stroke-opacity", (d) => getLinkAlpha(d,chartLinks.length))
        .attr("marker-start",(d) => checkLinkSelected(d) &&  d.direction === "both" && config.showArrows  ? "url(#arrowPathStart)" : "")
        .attr("marker-end",(d) => checkLinkSelected(d) && config.showArrows  ? "url(#arrowPathEnd)" : "")
    }

    const nodeHighlightStroke = 14;
    const getNodeStrokeElements = (element, d) => {
      const defaultValue = element === "width" ? 0 : 1;
      const highlight = element === "width" ? 0.5 : 0.5;
      if(config.graphDataType !== "parameter") return defaultValue;
      if(d.id === config.nearestNeighbourOrigin) return highlight;
      if(config.shortestPathStart === d.id && config.shortestPathEnd !== "") return highlight;
      if(config.shortestPathEnd === d.id && config.shortestPathStart !== "") return highlight;
      return defaultValue;
    }

    const getNodeLabelDy = (d) => {
      if(config.graphDataType === "submodule") return d.radius + remToPx(0.6);
      if(config.graphDataType === "segment") return d.radius + remToPx(0.5);
      if(config.currentLayout === "nearestNeighbour" && d.id === config.nearestNeighbourOrigin) return d.radius + remToPx(0.4);
      if(config.graphDataType === "parameter" && config.currentLayout === "default" && config.nearestNeighbourOrigin !== "") return d.radius + remToPx(0.6);

      return d.radius + remToPx(0.2);
    }
    const getNodeLabelSize = (d) => {
      if(config.graphDataType === "submodule") return "0.6em";
      if(config.graphDataType === "segment") return "0.5em";
      if(config.currentLayout === "nearestNeighbour" && d.id === config.nearestNeighbourOrigin) return "0.4rem";
      if(config.graphDataType === "parameter" && config.currentLayout === "default" && config.nearestNeighbourOrigin !== "") return "0.6rem";
      return "0.2rem"
    }

    const getNewQuiltMiddleNode = (nodeId, x,y, type) => {
        const descendant = config.expandedTreeData.descendants().find((f) => f.data.id === nodeId);

        return {
          id: descendant.data.id,
          name: descendant.data.NAME,
          radius: nodeRadiusScale(
            descendant.children ? descendant.leaves().length : 0
          ),
          color: color(descendant.data.subModule),
          children: descendant.children
            ? descendant.children.map((m) => m.data.id)
            : [],
          parameterCount: descendant.children ? descendant.leaves().length : 0,
          radiusVar: descendant.children ? descendant.leaves().length : 0,
          group: nodeId,
          parent: descendant.parent.data.id,
          stroke: "white",
          subModule: descendant.data.subModule,
          strokeWidth: 0,
          type,
          x,
          y
        };
    }
    const clickQuiltMiddle = (d) => {
      if((d.children) && d.type !== "tier3"){
        const childIds = d.children.length === 0 ? [] : typeof d.children[0] !== "object" ? d.children : d.children.map((m) => m.data.id);
        childIds.forEach((child) => {
          const newType = d.type === "tier1" ? "tier2" : "tier3";
          showEle.nodes.push(getNewQuiltMiddleNode(child, d.x, d.y, newType));
        })

        showEle.nodes = showEle.nodes.filter((f) => f.id !== d.id);
      }

      updatePositions(true);
    }

    const isNormalClick = (event) =>
      !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);


    // append chartNodes to nodesGroup and define attributes
    const nodesGroup = svg.select(".nodeGroup")
      .selectAll(".nodesGroup")
      .data(chartNodes, (d) => d.id)
      .join((group) => {
        const enter = group.append("g").attr("class", "nodesGroup");
        enter.append("circle").attr("class", "nodeBackgroundCircle");
        enter.append("circle").attr("class", "nodeCircle");
        enter.append("text").attr("class", "nodeLabel");
        return enter;
      });

    nodesGroup.attr("transform", (d) => `translate(${d.x},${d.y})`)
      .call(d3.drag()
        .on("drag", dragged))
      .on("mouseover",(event,d) => {
        if(config.graphDataType !== "parameter"){
          // for submodule + segment - only highlight if nodeClicked false
          if(!d.nodeClicked){
            d3.select(event.currentTarget).select(".nodeCircle").attr("stroke-width", 1);
            quiltOrMiddleHighlight(d);
          }
          let tooltipText = `${d.name || d.data.NAME}<br>Click to drill down`;
          if(d.type === "tier2"){
            // get submoduleName from config
            const subModuleName = config.expandedTreeData.descendants().find((f) => f.data.id === d.subModule).data.NAME;
            tooltipText = `<strong>Submodule: </strong>${subModuleName}<br><strong>Segment: </strong>${d.name}`;
          }
          if(d.type === "tier3"){
            // get submoduleName from config
            const subModuleName = config.expandedTreeData.descendants().find((f) => f.data.id === d.subModule).data.NAME;
            tooltipText = `<strong>Submodule: </strong>${subModuleName}<br><strong>Segment: </strong>${d.parent}<br><strong>Parameter: </strong>${d.name}`;
          }

          showTooltipExtra(event.x,event.y,tooltipText, false)

        } else {
          d3.select(event.currentTarget).select(".nodeCircle").attr("stroke-width", 1);
          updateTooltip(d, true, event.x);
          if(config.currentLayout === "nearestNeighbour"){
            // slightly different behaviour for NN
            svg.selectAll(".allLinkPaths")
              .attr("marker-start","")
              .attr("marker-end","")
              .attr("stroke-opacity", 0.05);
            svg.selectAll(".nodeCircle").attr("opacity",0.2);
            svg.selectAll(".allLinkPaths")
              .filter((f) => d.nnLinkIds.includes(f.source.id) && d.nnLinkIds.includes(f.target.id))
              .attr("marker-start", (n) => n.direction === "both"  ? "url(#arrowPathStart)" : "")
              .attr("marker-end","url(#arrowPathEnd)")
                .attr("stroke-opacity", 0.5);
            svg.selectAll(".nodeCircle")
              .filter((f) =>  d.nnLinkIds.includes(f.id))
              .attr("opacity",1);
          }
        }
      })
      .on("mouseout", (event,d) => {
        d3.select(".tooltipExtra").style("visibility","hidden")
          if(config.graphDataType === "parameter"){
            allNodeMouseout();
          if(expandedAll && config.currentLayout === "default"){
            tooltip.style("visibility", "hidden");
          } else {
            const tooltipNode = getTooltipNode();
            updateTooltip(tooltipNode, false, event.x);
          }
        } else if (!d.nodeClicked){
            allNodeMouseout();
          }
      })
      .on("click", (event, d) => {
        if (event.defaultPrevented) return; // dragged
        if(config.currentLayout === "default" && config.graphDataType === "parameter"){
          d3.select(event.currentTarget).raise();
          // disabling nearestNeighbour shift click when no links
          clickNode(d.NAME, "node", graph)
        }
        // do nothing on click if NN or SP layout
        // add segment when ready
        if(config.graphDataType !== "parameter"){
          if (isNormalClick(event) && d.children && d.type !== "tier3") {
            clickQuiltMiddle(d);
          } else if (d.type === "tier3") {
            //delete all depth 2 with my parent
            showEle.nodes = showEle.nodes.filter((f) => (f.parent?.id || f.parent) !== d.parent);
            // add parent if depth 1 = delete all
            showEle.nodes.push(getNewQuiltMiddleNode(d.parent, d.x, d.y, "tier2"));
            updatePositions(true);
          } else if (d.type === "tier2") {
            // delete all with matching subModule
            showEle.nodes = showEle.nodes.filter((f) => f.subModule !== d.subModule);
            // add submodule parent
            showEle.nodes.push(getNewQuiltMiddleNode(d.subModule, d.x, d.y, "tier1"));
            updatePositions(true);
          }

          // this holds the highlight view if nodeClicked - clicking again resets
        //  if(d.clicked){
        //    d.clicked = false;
        //    allNodeMouseout();
        //  } else {
        //    d.clicked = true;
        //    quiltOrMiddleHighlight(d);
        //  }
        //  svg.selectAll(".nodesGroup").each((n) => n.nodeClicked = d.clicked);
        //  d3.select(event.currentTarget).select(".nodeCircle").attr("stroke-width", 1);
       //   svg.selectAll(".nodeCircle")
        //    .filter((f) => f.id !== d.id)
         //   .attr("stroke-width",0)
         //   .each((n) => n.clicked = false);

        }
      })

    // used in animation when NN flickering
    nodesGroup
      .select(".nodeBackgroundCircle")
      .attr("opacity", (d) => getNodeAlpha(d.NAME, d.radiusVar,false))
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("stroke", "white")
      .attr("stroke-width", 0)
      .attr("stroke-opacity", (d) => getNodeStrokeElements("opacity",d))

    nodesGroup
      .select(".nodeCircle")
      .attr("opacity", (d) => getNodeAlpha(d.NAME, d.radiusVar,false))
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("stroke", "white")
      .attr("stroke-width", (d) => d.strokeWidth ? d.strokeWidth : getNodeStrokeElements("width",d))
      .attr("stroke-opacity", (d) => d.strokeWidth ? 1 : getNodeStrokeElements("opacity",d))

    const pulseNNCircle = () => {
      // node animation for NN origin
      svg.selectAll(".nodeBackgroundCircle")
        .attr("stroke-width", 0)
        .filter((f) => f.NAME === config.nearestNeighbourOrigin)
        .interrupt()
        .transition()
        .duration(300)
        .attr("stroke-width", nodeHighlightStroke)
        .transition()
        .duration(300)
        .attr("stroke-width", 0)
        .on("end",() => {
            pulseNNCircle();
        })

    }
    if(config.nearestNeighbourOrigin !== "" && config.currentLayout === "default" && config.graphDataType === "parameter"){
      pulseNNCircle();
    }

    nodesGroup
      .select(".nodeLabel")
      .attr("pointer-events","none")
      .style("display", getNodeLabelDisplay)
      .attr("text-anchor", "middle")
      .attr("dy",getNodeLabelDy)
      .attr("fill", "white")
      .attr("font-size",getNodeLabelSize)
      .text((d) => d.NAME || d.data?.NAME || d.name);

    // if request, zoom to bounds of current data
    if(zoomToBounds){
      let zoomNodes = chartNodes;
      if(!expandedAll && config.currentLayout === "default"){
        zoomNodes = zoomNodes.filter((f) => config.selectedNodeNames.includes(f.id));
      }
      performZoomAction(zoomNodes,initial ? 0 : 400,"zoomFit")
    }

    const tooltipNode = getTooltipNode();
    // cancel loader
    d3.select(".animation-container").style("display", "none");
    if(config.graphDataType === "parameter"){
      // update tooltip if parameter
      updateTooltip(tooltipNode, false);
    }
  }
  // simulation functions
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

      const centroids = d3.rollup(nodes, centroid, (r) => config.graphDataType === "parameter" ?   r.subModule : r.group);
      const l = alpha * strength;
      for (const d of nodes) {
        const { x: cx, y: cy } = centroids.get(config.graphDataType === "parameter" ?  d.subModule : d.group );
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
  function updateTooltip(d, mouseover) {

    let contentStr = "";
    let nodeTableMapper = {};
    const defaultAndOne = config.currentLayout === "default" && config.selectedNodeNames.length === 1;
    const otherAndOne = config.currentLayout !== "default" && config.notDefaultSelectedNodeNames.length == 1;
    let listToShow = config.currentLayout === "default" ? config.selectedNodeNames : config.notDefaultSelectedNodeNames;
    if(config.currentLayout === "default" && config.selectedNodeNames.length === config.notDefaultSelectedNodeNames.length || config.tooltipRadio !== "none"){
      // using notDefaultSelectedNodeNames as this is from a NN search
      listToShow = config.notDefaultSelectedNodeNames;
    }
    if(mouseover || defaultAndOne || otherAndOne){
      config.setTooltipRadio("none");
      tooltip.style("padding","0.4rem");
      let content = [];
      content.push(`<div style="background-color: ${d.color} "><p style='text-align: center' >${d.NAME}</p></div>`); // tooltip title
      const datum = nodes.find(node => node.NAME === d.NAME)
      TOOLTIP_KEYS.forEach(key => {
        if(datum[key] && datum[key] !== ""){
          content.push(`<div><b>${key}: </b><span>${datum[key]}</span></div>`);
        }
      })

      content.map((d) => (contentStr += d));
    } else if (!expandedAll || (config.currentLayout !== "default" && config.graphDataType === "parameter")) {
      let content = [];
       if(listToShow.length > 0){
         if(!listToShow.some((s) => s.direction === undefined) && config.currentLayout === "default"){
           if(config.tooltipRadio === "none"){
             config.setTooltipRadio("both");
           }
           const nnNode = showEle.nodes.find((f) => f.NAME === config.nearestNeighbourOrigin);
           if(nnNode) {
             content = [`<div style="white-space: nowrap; text-overflow: ellipsis; background-color :${nnNode.color}">${nnNode.NAME.toUpperCase()}${nnNode["DISPLAY NAME"] ? " - " : ""}${nnNode["DISPLAY NAME"] || ""}</div>
            <div id="directionToggle">
             <label><input type="radio" class="directionToggle" name="directionToggle" value="both" ${config.tooltipRadio === "both" ? "checked" : ""}>both</label>
             <label><input type="radio" class="directionToggle" name="directionToggle" value="in" ${config.tooltipRadio === "in" ? "checked" : ""}>&larr; only</label>
             <label><input type="radio" class="directionToggle" name="directionToggle" value="out" ${config.tooltipRadio === "out" ? "checked" : ""}>&rarr; only</label>
           </div>`]
             listToShow = listToShow.filter((f) => f.name !== config.nearestNeighbourOrigin);
           }
         } else {
           config.setTooltipRadio("none");
         }
        tooltip.style("padding","0.05rem")
         const shortestPathHeader = config.nearestNeighbourOrigin === "" ? "" : `<th style='width:5%;'></th>`;
        const tableStart = `<table style='overflow-y: auto; overflow-x: hidden; font-size: 0.7rem; table-layout: fixed;  width: 100%;'><thead><tr>${config.graphDataType === "parameter" ? "<th style='width:30%; color: black;'>SEGMENT</th>" : ""}<th style='width:35%; color: black;'>NAME</th><th style='width:30%; color: black;'>DISPLAY NAME</th>${shortestPathHeader}</tr></thead><tbody>`
        content.push(tableStart);
        let nodeRows = []
        listToShow.forEach((d,i) => {
          let directionUnicode = "";
          if(d.direction && d.direction !== "centre"){
            directionUnicode = d.direction === "in" ? ` (&larr;)` : ` (&rarr;)`
          }
          const nodeName = typeof  d === "string" ? d : d.name;
          const matchingNode = showEle.nodes.find((f) => f.NAME === nodeName);
          if(matchingNode){
            const shortestPathCell = config.nearestNeighbourOrigin === "" ? "" : `<td class='shortestPathLink' id='${matchingNode.NAME}' style='width:5%; cursor:pointer;'><i class='fas fa-wave-square'></i></td>`
            nodeRows.push({row: `<tr>${config.graphDataType === "parameter" ? `<td style='background-color:${matchingNode.color}; color: white; width:30%;'>${matchingNode.SEGMENT_NAME}</td>`: ""}<td class="nodeTableRow" id='nodeTableRow${i}' style="width:35%;">${nodeName}${directionUnicode}</td><td class="nodeTableRow" id='nodeTableRow${i}' style="width:35%;">${matchingNode["DISPLAY NAME"] || ""}</td>${shortestPathCell}</tr>`, subModule: matchingNode.SUBMODULE_NAME, name: matchingNode.NAME}); // tooltip title
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

    let tooltipVisibility = "visible";
    if(config.graphDataType !== "parameter") tooltipVisibility = "hidden";
    if(listToShow.length === 0) tooltipVisibility = "hidden";
    if(config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin === "") tooltipVisibility = "hidden";
    if(config.currentLayout === "shortestPath" && (config.shortestPathStart === "" || config.shortestPathEnd === "")) tooltipVisibility = "hidden";
     if(expandedAll) tooltipVisibility = "hidden";
    d3.select("#tooltipCount")
      .text(tooltipVisibility === "visible" && !mouseover ? `${listToShow.length} node${listToShow.length > 1 ? "s" : ""} selected` : "")

    tooltip
      .html(`${contentStr}`)
      .style("top", "1.2rem") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", "1rem")
      .style("visibility", tooltipVisibility);

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
        const currentText = d3.select(event.currentTarget).text();
        const currentWidth = d3.select(event.currentTarget).node().getBoundingClientRect().width;
        if(measureWidth(currentText,12) > currentWidth){
          showTooltipExtra(event.x, event.y, currentText);
        }

      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })

    activateTooltipToggle();

    d3.selectAll(".shortestPathLink")
      .on("mouseover", (event, d) => {
        showTooltipExtra(event.x, event.y, `click to see Shortest Path from ${config.nearestNeighbourOrigin} to ${event.currentTarget.id}`)
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        tooltipExtra.style("visibility","hidden");
        config.shortestPathStart = config.nearestNeighbourOrigin;
        config.shortestPathEnd = event.currentTarget.id;
        config.currentLayout = "shortestPath";
        config.nearestNeighbourOrigin = "";
        d3.select('#search-container-sp-end').style("display","block");
        d3.select("#search-input-sp-end").property("value",config.shortestPathEnd);
        d3.select("#nnDegreeDiv").style("display","none");
        d3.selectAll("#search-input")
          .attr("placeholder","Search for start node")
          .property("value",config.shortestPathStart);
        d3.selectAll(".dropdown-item").style("color", (d, i, objects) => {
          return config.currentLayout === objects[i].id ? "white" : "#808080";
        })
        resetMenuVisibility(width);
        positionShortestPath(graph);
      })

  }
  //////////////////////////////////////////////////////////////////////////////

  const measureWidth = (text, fontSize) => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
  }
  const showTooltipExtra = (x, y,textContent, centreContent = true) => {
    let tooltipLeft = x + 10;
    let tooltipTop = y;
    if(centreContent){
      const textSize = remToPx(0.5);
      const textWidth = measureWidth(textContent,textSize);
      tooltipLeft = x - (textWidth/2);
      if((x + textWidth) > width){
        tooltipLeft = x - textWidth;
      }
      if((x - textWidth) < 0){
        tooltipLeft = x;
      }
      tooltipTop = y + (textSize * 2);
      if((tooltipTop + (textSize * 2)) > height){
        tooltipTop = y - (textSize * 4);
      }
    }

    tooltipExtra.style("left", `${tooltipLeft}px`)
      .style("font-size", "0.5rem")
      .style("top",`${tooltipTop}px`)
      .style("visibility", "visible")
      .html(textContent)

  }

  const switchLayouts = (graph) => {
    d3.select("#search-input").property("value","");
    d3.select("#infoMessage").style("visibility","hidden");
    svg.selectAll(".nodeLabel").style("display",getNodeLabelDisplay);
    d3.select("#hide-single-button").style("display","none");
    config.setTooltipRadio("none");
    if(config.currentLayout === "default"){
      d3.select("#showInfo").classed("hidden",window.innerWidth >= 1000);
      d3.select("#hideInfo").classed("hidden",window.innerWidth < 1000);
      d3.select("#nnDegreeDiv").style("display","none");
      d3.selectAll("#search-input").attr("placeholder","Search for variables");
      d3.select("#hide-single-button").style("display","block");
      d3.select('#search-container-sp-end').style("display","none");
      if(config.selectedNodeNames.length === 0){
        config.setSelectedNodeNames(config.allNodeNames);
        config.setNotDefaultSelectedNodeNames([]);
        config.setNotDefaultSelectedLinks([]);
      }
      resetDefaultNodes();
      updatePositions(true);
    } else {
      if(config.currentLayout === "nearestNeighbour"){
        config.shortestPathStart = "";
        config.shortestPathEnd = "";
        if(config.selectedNodeNames.length > 0 && !expandedAll) {
          config.nearestNeighbourOrigin = config.selectedNodeNames[0];
        }
        if(config.nearestNeighbourOrigin !== ""){
          positionNearestNeighbours(false);
        } else {
          d3.select("#infoMessage").text(MESSAGES.NN).style("visibility","visible");
          updatePositions(true);
        }
        d3.select('#search-container-sp-end').style("display","none");
        d3.select("#nnDegreeDiv").style("display","block");
        // d3.select("#search-tab-container").style("height","6rem");
        d3.selectAll("#search-input")
          .attr("placeholder","Search for origin node")
          .property("value",config.nearestNeighbourOrigin);
      }
      if(config.currentLayout === "shortestPath"){
        config.nearestNeighbourOrigin = "";
        if(config.selectedNodeNames.length > 0 && !expandedAll){
          config.shortestPathStart = config.selectedNodeNames[0];
          d3.select("#infoMessage").text(MESSAGES.SP).style("visibility","visible");
          updatePositions(true);
        } else {
          if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
            positionShortestPath(graph);
          } else {
            d3.select("#infoMessage").text(MESSAGES.SP).style("visibility","visible");
            updatePositions(true);
          }
        }
        d3.select('#search-container-sp-end').style("display","block");
        d3.select("#search-input-sp-end").property("value",config.shortestPathEnd);
        d3.select("#nnDegreeDiv").style("display","none");
        d3.selectAll("#search-input")
          .attr("placeholder","Search for start node")
          .property("value",config.shortestPathStart);
      }
    }
    d3.selectAll(".dropdown-item").style("color", (d, i, objects) => {
      return config.currentLayout === objects[i].id ? "white" : "#808080";
    })
    resetMenuVisibility();
  }
  function updateButtons(graph) {

    d3.select("#resetButton")
      .text(config.graphDataType !== "parameter" || config.currentLayout !== "default" || expandedAll ? "" : "Reset")
      .on("click",(event) => {
        d3.select("#tooltipCount").text("");
        d3.selectAll(".nodeCircle").attr("opacity",1);
        expandedAll = true;
        performZoomAction(showEle.nodes,400,"zoomFit");
        d3.select(event.currentTarget).text("");
        config.setSelectedNodeNames(config.allNodeNames);
        config.setNotDefaultSelectedLinks([]);
        config.setNotDefaultSelectedNodeNames([]);
        config.setNearestNeighbourOrigin("");
        config.setShortestPathStart("");
        config.setShortestPathEnd("");
        config.setTooltipRadio("none");
        d3.select(".tooltip").style("visibility","hidden");
        drawTree();

      });
    const resetButtons = d3.selectAll(".resetButton");

    resetButtons
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        d3.select(event.currentTarget).style("color","#A0A0A0");
        showTooltipExtra(event.x, event.y, "reset search")
      })
      .on("mouseout", () => {
        resetButtons.style("color","white");
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        const buttonId = event.currentTarget.id;
        let message = "";
        if(buttonId === "refreshNN"){
          config.nearestNeighbourOrigin = "";
          message = MESSAGES.NN;
          config.setNotDefaultSelectedLinks([]);
          renderNNLevelLabels([]);
        } else {
          config.shortestPathStart = "";
          config.shortestPathEnd = "";
          message = MESSAGES.SP;
        }
        config.setNotDefaultSelectedNodeNames([]);
        d3.select("#search-input").property("value","");
        d3.select("#search-input-sp-end").property("value","");
        d3.select("#infoMessage").text(message).style("visibility","visible");
        updatePositions(true);
      })


    const helpInfoButton = d3.select("#helpInfo");

    helpInfoButton
      .on("mouseover mousemove", (event) => {
        d3.select(event.currentTarget).style("color","#A0A0A0");
        const infoPanelVisible = d3.select("#helpInformationPanel").style("visibility") === "visible";
        showTooltipExtra(event.x, event.y, `click to ${infoPanelVisible ? "hide" : "show"} help panel`)
      })
      .on("mouseout", () => {
        helpInfoButton.style("color","white");
        tooltipExtra.style("visibility","hidden");
      })

      .on("click", () => {
        const infoPanelVisible = d3.select("#helpInformationPanel").style("visibility") === "visible";
        d3.select("#helpInformationPanel").style("visibility",infoPanelVisible ? "hidden" : "visible");
      })

    const downloadImageButton = d3.select("#downloadImage");

    downloadImageButton
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        d3.select(event.currentTarget).style("color","#A0A0A0");
        showTooltipExtra(event.x, event.y, "click to download chart as an image")
      })
      .on("mouseout", () => {
        downloadImageButton.style("color","white");
        tooltipExtra.style("visibility","hidden");
      })

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
        positionNearestNeighbours(false);
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
          updatePositions(true);
        }
      })
    const layoutOptions = d3.selectAll(".dropdown-item")

    layoutOptions.style("color", (d, i, objects) => {
      return config.currentLayout === objects[i].id ? "white" : "#808080";
    })
      .on("click", (event) => {
        // clear nearly new and move default -> selected if moving from nn or sp
        renderNNLevelLabels([]);
        const newLayout = event.currentTarget.id;
        if(newLayout === "default" ){
          if(expandedAll && config.notDefaultSelectedNodeNames.length > 0){
            config.setSelectedNodeNames([]);
          }
          // replacing selectedNodeNames if coming from SP or NN
          config.setSelectedNodeNames(config.notDefaultSelectedNodeNames.map((m) => m.name));
        }
        config.setCurrentLayout(newLayout);
        d3.select(".animation-container").style("display", "flex");
        setTimeout(() => {
          switchLayouts(graph);
        }, 0); // or 16 for ~1 frame delay at 60fps

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
