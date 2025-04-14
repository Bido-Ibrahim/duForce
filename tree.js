import * as d3 from "d3";
import {  COLOR_SCALE_RANGE, PANEL_WIDTH } from "./constants";
import { renderGraph } from "./main";
import { config } from "./config";
export const getColorScale = () => {
  // color scale (same as original)
  return  d3.scaleOrdinal(config.subModules, COLOR_SCALE_RANGE);
}
const getHierarchy = (nodes) => {

  const ROOT = { id: "ROOT" };
  // slightly re-written since data is simpler for chart - same result
  const SUBMODULES = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SUBMODULE}-${node.SUBMODULE_NAME}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
        // handling null values
      const subModuleId = `submodule-${entrySplit[0]}`;
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === subModuleId)){
        acc.push({
          id: subModuleId,
          parent: "ROOT",
          subModule: subModuleId,
          NAME: entrySplit[1],
          type: "tier1",
        });
      } else {
        console.error(`${entry} is being filtered out as this subModule ID has been used previously with a different subModule Name`)
      }
      return acc;
    },[])
    .sort((a,b) => d3.ascending(a.NAME,b.NAME))



  config.setSubModules(SUBMODULES.map((m) => m.id))
  // slightly re-written since data is simpler for chart - same result
  const SEGMENTS = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SEGMENT}-${node.SEGMENT_NAME}-${node.SUBMODULE}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
      const parent = `submodule-${entrySplit[2]}`;
      const segmentId =`segment-${entrySplit[0]}`
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === segmentId)) {
        acc.push( {
          id: segmentId,
          subModule: parent,
          parent,
          NAME: entrySplit[1],
          type: "tier2",
        });
      } else {
        console.error(`${segmentId} with submodule ${parent} is being filtered out as this segmentId has been used previously with a different Segment Name`)
      }
      return acc;
    },[])

  let data = nodes.reduce((acc, node,i) => {
      acc.push({
        parent: `segment-${node.SEGMENT}`,
        subModule: `submodule-${node.SUBMODULE}`,
        id: node.id,
        NAME: node.NAME,
        type: "tier3"
      })
    return acc;
  },[])

  data = data.sort((a,b) => d3.ascending(a.NAME.toLowerCase(), b.NAME.toLowerCase()));
  const stratifyData = [ROOT].concat(SUBMODULES).concat(SEGMENTS).concat(data);

  return d3
    .stratify()
    .id((d) => d.id)
    .parentId((d) => d.parent)(stratifyData)
    .eachBefore((d,i) => { // sort as previous
      d.data.hOrderPosition = i; // needed to keep correct order of tree menu
  });
}
// constants for drawTree function
// From https://fontawesome.com/
// go to approach is to use unicode's but the browser is converting text -> svg (never seen that before) and it's not rendering
// since there are only a few icons, I'm reverting to svgs and storing the paths + viewboxes as constants
const downArrowPath = "M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"
const rightArrowPath = "M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"
const rightArrowViewBox = "0 0 320 512";
const standardViewBox = "0 0 448 512"
const allSelectedPath = "M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"
const partSelectedPath = "M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM152 232l144 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-144 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"
const noneSelectedPath = "M384 80c8.8 0 16 7.2 16 16l0 320c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32z"
const colorScale = getColorScale();
const iconWidthHeight = 16;
const depthExtra = (depth, increment) => (depth -1) * increment;

export const remToPx = (rem) =>{
  // converts rem to px so we can maintain re-sizing
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return rem * rootFontSize;
}

const marginTop = 0;
const rowHeight = remToPx(1.7);
const treeDivId = "view";
// search-tab-container width is 18rem;
let treeWidth = remToPx(18);

// config.selectedNodeNames used by chart + list
const getSelectedPath = (descendantNames) => {
  const hasSelected = descendantNames.some((s) => config.selectedNodeNames.includes(s));
  const hasUnselected = descendantNames.some((s) => !config.selectedNodeNames.includes(s));
  if(hasSelected && !hasUnselected) return allSelectedPath;
  if(hasSelected) return partSelectedPath;
  return noneSelectedPath;
}


export const drawTree = () => {

  const currentTreeData = config.currentTreeData;
  const svg =  d3.select(`.${treeDivId}_svg`);
  const treeHeight = marginTop + (currentTreeData.descendants().length * rowHeight);
  svg.attr("height",treeHeight);

  const chartData = currentTreeData.descendants()
    .filter((f) => f.depth > 0)
    .sort((a,b) => d3.ascending(a.data.hOrderPosition, b.data.hOrderPosition));

  const treeGroup = svg
    .selectAll(".treeGroup")
    .data(chartData, (d) => d.data.hOrderPosition)
    .join((group) => {
      const enter = group.append("g").attr("class", "treeGroup");
      enter.append("text").attr("class", "treeLabel");
      enter.append("line").attr("class", "verticalLine");
      enter.append("svg").attr("class","expandCollapseIcon").append("path").attr("class", "expandCollapseIconPath");
      enter.append("rect").attr("class","expandClickRect")
      enter.append("svg").attr("class", "selectedCheckboxIcon").append("path").attr("class", "selectedCheckboxIconPath");
      enter.append("rect").attr("class","checkboxClickRect")
      return enter
    })

  treeGroup.attr("transform",(d,i) =>`translate(0,${marginTop + (i * rowHeight)})`)

  treeGroup.select(".expandClickRect")
    .attr("display", (d) => !d.children && !d.data._children ? "none" : "block")
    .attr("cursor","pointer")
    .attr("width", treeWidth - iconWidthHeight - 10)
    .attr("height", rowHeight)
    .attr("fill","transparent")
    .on("click", (event, d) => {
      if(!d.children  && d.data._children){
        d.children = d.data._children;
        d.data._children = undefined;
      } else if (d.children !== undefined){
        d.data._children = d.children;
        d.children = undefined;
      }
      config.setCurrentTreeData(currentTreeData);
      drawTree();
    });

  treeGroup.select(".treeLabel")
    .attr("font-weight", 400)
    .attr("font-size", (d) => `${0.9 - depthExtra(d.depth,0.1)}rem`)
    .attr("dominant-baseline","middle")
    .attr("x",  (d) =>  iconWidthHeight + 5 + depthExtra(d.depth,15))
    .attr("y",   rowHeight/2)
    .attr("fill", (d) => colorScale(d.data.subModule))
    .text((d) => `${d.data.NAME}`);

  treeGroup.select(".verticalLine")
    .attr("x1", 0)
    .attr("x2", treeWidth)
    .attr("y1", rowHeight )
    .attr("y2", rowHeight )
    .attr("stroke", "#A0A0A0")
    .attr("stroke-width", 0.25);

  treeGroup.select(".expandCollapseIcon")
    .attr("display", (d) => d.depth === 3 ? "none" : "block")
    .attr("width",  (d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("height",(d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("viewBox",(d) => !d.children ? rightArrowViewBox : standardViewBox)
    .attr("x",  (d) =>   depthExtra(d.depth,15))
    .attr("y", (d) => (rowHeight - iconWidthHeight + depthExtra(d.depth,2))/2);

  treeGroup.select(".expandCollapseIconPath")
    .attr("d", (d) => !d.children ? rightArrowPath : downArrowPath)
    .attr("fill", "#F0F0F0");

  treeGroup.select(".selectedCheckboxIcon")
    .style("display",config.graphDataType === "parameter" ? "block" : "none")
    .attr("width",  (d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("height",(d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("viewBox",standardViewBox)
    .attr("x",  (d) =>  treeWidth - 5 - (iconWidthHeight - depthExtra(d.depth,2)))
    .attr("y", (d) => (rowHeight - iconWidthHeight + depthExtra(d.depth,2))/2);

  treeGroup.select(".selectedCheckboxIconPath")
    .attr("d", (d) => getSelectedPath(d.data.type === "tier3" ? [d.data.NAME] : config.tier1And2Mapper[d.data.id]))
    .attr("fill", "#F0F0F0");

  treeGroup.select(".checkboxClickRect")
    .attr("cursor","pointer")
    .attr("x", treeWidth - iconWidthHeight - 10)
    .attr("width", iconWidthHeight + 10)
    .attr("height", rowHeight)
    .attr("fill","transparent")
    .on("click",(event, d) => {
      if(d.data.type === "tier3") {
        if (config.selectedNodeNames.includes(d.data.NAME)) {
          // tier 3 (chart nodes) - currently selected
          // unselect all descendants
          config.setSelectedNodeNames(config.selectedNodeNames.filter((f) =>  f !== d.data.NAME))
        } else {
          // tier 3 (chart nodes) - current unselected;
          config.addToSelectedNodeNames(d.data.NAME);
        }
      } else if (config.graphDataType === "parameter"){
        const descendants = config.tier1And2Mapper[d.data.id];
        const selectedPath = getSelectedPath(descendants);
        if(selectedPath === allSelectedPath){
          config.setSelectedNodeNames(config.selectedNodeNames.filter((f) => !descendants.includes(f)))
        } else {
          // part or none selected === all all
          descendants.forEach((t) => {
            config.addToSelectedNodeNames(t);
          })
        }
      }
      config.setCurrentTreeData(currentTreeData);
      drawTree();
      renderGraph(false);
    });
}

const getLinkDirection = (linkIn, linkOut) => {
  if(linkIn && linkOut) return "both";
  if(linkIn) return "inbound";
  return "outbound";
}
const getHierarchyLinks = (nodeSet, allLinks) =>  Array.from(nodeSet).reduce((acc, parent) => {
    const otherNodes = Array.from(nodeSet).filter((f) => f !== parent);
    const nodeParameters = config.tier1And2Mapper[parent];
     otherNodes.forEach((node) => {
      const currentParameters = config.tier1And2Mapper[node];
      const linkOut = allLinks.some((s) => nodeParameters.includes(s.source)
        && currentParameters.includes(s.target));
      const linkIn = allLinks.some((s) => nodeParameters.includes(s.target)
        && currentParameters.includes(s.source));
      const direction = getLinkDirection(linkIn,linkOut);
      if(!acc.some((s) => (s.source === parent && s.target === node) ||
        (s.source === node && s.target === parent))){
        acc.push({source: parent, target: node, direction});
      }
      })
  return acc;
},[])


const setHierarchyData = (nodesCopy) => {
  const subModuleNames = new Set();
  const segmentNames = new Set();
  nodesCopy.descendants()
    .map((m) => {
      if(m.depth === 2){
        m.data.parameterCount = m.children.length;
        m.children = undefined;
        m.data.children = undefined;
        segmentNames.add(m.data.id);
      }
      if(m.depth === 1){
        m.data.parameterCount = d3.sum(m.children, (s) => s.children.length);
        subModuleNames.add(m.data.id);
      }
    })
  const subModuleLinks = getHierarchyLinks(subModuleNames,config.parameterData.links);
  const segmentLinks = getHierarchyLinks(segmentNames,config.parameterData.links);
  const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1).map((m) => m.data);
  const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2).map((m) => m.data);

  config.setHierarchyData(
    {submodule: {nodes: subModuleNodes, links: subModuleLinks, nodeNames: Array.from(subModuleNames)},
      segment:{nodes: segmentNodes, links: segmentLinks, nodeNames: Array.from(segmentNames)}})

}
export default function VariableTree(nodes) {
  // initial set up for tree and buttons above
  const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));
  config.setAllNodeNames(selectedNodeNamesCopy);

  const data = getHierarchy(nodes);


  // mapping submodules and segments to their child nodes (for tree selection)
  config.tier1And2Mapper = data.descendants().filter((f) => f.data.type === "tier3").reduce((acc, entry) => {
    const {subModule, parent, NAME} = entry.data;
    if(!acc[subModule]) {acc[subModule] = []};
    if(!acc[parent]) {acc[parent] = []};
    acc[subModule].push(NAME);
    acc[parent].push(NAME);
    return acc;
  },{})

  const nodesCopy = data.copy();
  setHierarchyData(nodesCopy);


  d3.selectAll(".chartDataRadio")
    .on("change", (event) =>  {
      config.graphDataType = event.currentTarget.value;
      config.currentLayout = "default";
      const selectedNames = config.graphDataType === "parameter" ? selectedNodeNamesCopy : config.hierarchyData[config.graphDataType].nodeNames;
      const nodeNamesCopy = JSON.parse(JSON.stringify(selectedNames));
      config.setSelectedNodeNames(nodeNamesCopy);
      svg.selectAll(".viewPanelFilterButton")
        .attr("visibility", config.graphDataType === "parameter" ? "visible" : "hidden");
      svg.selectAll(".selectedCheckboxIcon").style("display",config.graphDataType === "parameter" ? "block" : "none")
        svg.selectAll(".selectedCheckboxIconPath")
        .attr("d", (d) => getSelectedPath(d.data.type === "tier3" ? [d.data.NAME] : config.tier1And2Mapper[d.data.id]))

      renderGraph(config.graphDataType !== "parameter");
  });

  // this could potentially be a property
  const startingDepth = 1;
  // hiding children beyond startingDepth - common d3 practice

  const setToStartingDepth = (dataset) => {
    dataset.descendants()
      .forEach((d) => {
        if(d.children){
          if(d.depth >= startingDepth){
            d.data._children = d.children;
            d.children = undefined;
          }
        }
      });
    return data;
  }

  const allExpandedData = data.copy();
  config.setExpandedTreeData(allExpandedData)
  const treeData = setToStartingDepth(data);
  const allCollapsedData = treeData.copy();
  config.setCollapsedTreeData(allCollapsedData);
  config.setCurrentTreeData(treeData);

  const initialTreeHeight = marginTop + (treeData.descendants().length * rowHeight); // this resets after each render

  d3.select(`#${treeDivId}`)
    .style("pointer-events", "auto")
    .on('wheel', function(event) {
      event.stopPropagation(); // Prevent the scroll event from affecting other elements
    })

  // append svg if there is one
  let svg = d3.select(`.${treeDivId}_svg`);
  if(svg.node() === null) {

    svg = d3.select(`#${treeDivId}`)
      .append("svg")
      .attr("class",`${treeDivId}_svg`)
      .attr("width", treeWidth)
      .attr("height", initialTreeHeight);

  } else {
    svg.attr("width", treeWidth)
      .attr("height", initialTreeHeight);
  }

  drawTree();
  renderGraph(true);


  d3.select("#selectUnselectButton")
    .text("unselect ALL")
    .on("click",(event) => {
      if(config.graphDataType === "parameter"){
        const text = d3.select(event.currentTarget).text();
        const newText = text === "select ALL" ? "unselect ALL" : "select ALL"
        d3.select(event.currentTarget).text(newText);
        if(text === "select ALL"){
          // add all names to selected nodes
          config.setSelectedNodeNames(selectedNodeNamesCopy);
        } else {
          // clear selected nodes
          config.setSelectedNodeNames([]);
        }
        drawTree();
        renderGraph(false);
      }
    });

  d3.select("#collapseExpandButton")
    .text("expand ALL")
    .on("click",(event) => {
      const text = d3.select(event.currentTarget).text();
      const newText = text === "expand ALL" ? "collapse ALL" : "expand ALL"
      if(text === "expand ALL"){
        // convert all _children to children
        d3.select(event.currentTarget).text("...")
        config.setCurrentTreeData(config.expandedTreeData);

      } else {
        // switch back to startingDepth
        config.setCurrentTreeData(config.collapsedTreeData)
      }
      d3.select(event.currentTarget).text(newText);
      drawTree();
    });

  const resizeThrottle = (func, limit) => {
    // from chatGPT - stops it resizing every nanosecond
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

// Your resize handler function
  function handleResize() {
    // redraw tree on resize so container size matches tree size
    treeWidth = remToPx(18);
    svg.attr("width", treeWidth)
    drawTree();
  }

// Add throttled event listener
  window.addEventListener("resize", resizeThrottle(handleResize, 100));

}
