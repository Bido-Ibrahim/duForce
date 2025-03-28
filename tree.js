import * as d3 from "d3";
import { COLOR_SCALE_DOMAIN_ID, COLOR_SCALE_RANGE, PANEL_WIDTH } from "./constants";
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
      }
      return acc;
    },[])
    .sort((a,b) => d3.ascending(a[COLOR_SCALE_DOMAIN_ID],b[COLOR_SCALE_DOMAIN_ID]))

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
      }
      return acc;
    },[])

  let data = nodes.reduce((acc, node,i) => {
    if(i === 0) {
      acc.push(ROOT);
    }
      acc.push({
        parent: `segment-${node.SEGMENT}`,
        subModule: `submodule-${node.SUBMODULE}`,
        id: node.id,
        NAME: node.NAME,
        type: "tier3"
      })
    return acc;
  },[])

  data = data.concat(SUBMODULES).concat(SEGMENTS);

  return d3
    .stratify()
    .id((d) => d.id)
    .parentId((d) => d.parent)(data)
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

const marginTop = 30;
const rowHeight = 30;
const treeDivId = "view";
const treeWidth = PANEL_WIDTH;

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
    .data(chartData)
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
    .attr("font-size", (d) => 16 - depthExtra(d.depth,2))
    .attr("dominant-baseline","middle")
    .attr("x",  (d) =>  iconWidthHeight + 5 + depthExtra(d.depth,15))
    .attr("y",   rowHeight/2)
    .attr("fill", (d) => colorScale(d.data.subModule))
    .text((d) => d.data.NAME);

  treeGroup.select(".verticalLine")
    .attr("x1", 0)
    .attr("x2", treeWidth)
    .attr("y1", rowHeight )
    .attr("y2", rowHeight )
    .attr("stroke", "#A0A0A0")
    .attr("stroke-width", 0.25);

  treeGroup.select(".expandCollapseIcon")
    .attr("display", (d) => !d.children && !d.data._children ? "none" : "block")
    .attr("width",  (d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("height",(d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("viewBox",(d) => !d.children ? rightArrowViewBox : standardViewBox)
    .attr("x",  (d) =>   depthExtra(d.depth,15))
    .attr("y", (d) => (rowHeight - iconWidthHeight + depthExtra(d.depth,2))/2);

  treeGroup.select(".expandCollapseIconPath")
    .attr("d", (d) => !d.children ? rightArrowPath : downArrowPath)
    .attr("fill", "#F0F0F0");

  treeGroup.select(".selectedCheckboxIcon")
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
      } else {
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
export default function VariableTree(nodes) {
  // initial set up for tree and buttons above
  const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));

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

  // this could potentially be a property
  const startingDepth = 1;
  // hiding children beyond startingDepth - common d3 practice

  const setToStartingDepth = () => {
    data.descendants()
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

  config.setExpandedTreeData(data.copy())
  const treeData = setToStartingDepth();
  config.setCollapsedTreeData(setToStartingDepth().copy());
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

    svg.append("line")
      .attr("class", `${treeDivId}_topLine`);

    svg.append("text")
      .attr("class", `${treeDivId}_selectButton`);

    svg.append("text")
      .attr("class", `${treeDivId}_collapseButton`);
  } else {
    svg.attr("width", treeWidth)
      .attr("height", initialTreeHeight);
  }

  drawTree();
  renderGraph(true);

  svg.select(`.${treeDivId}_topLine`)
    .attr("x1", 0)
    .attr("x2", treeWidth)
    .attr("y1", marginTop )
    .attr("y2", marginTop)
    .attr("stroke", "#A0A0A0")
    .attr("stroke-width", 0.25);

  svg.select(`.${treeDivId}_selectButton`)
    .attr("x", treeWidth)
    .attr("y", 12)
    .attr("cursor","pointer")
    .attr("fill", "white")
    .attr("font-weight", 400)
    .attr("text-anchor","end")
    .attr("font-size", 16)
    .attr("dominant-baseline","middle")
    .text("unselect ALL")
    .on("click",(event) => {
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
    });

  svg.select(`.${treeDivId}_collapseButton`)
    .attr("cursor","pointer")
    .attr("x", 5)
    .attr("y", 12)
    .attr("fill", "white")
    .attr("font-weight", 400)
    .attr("font-size", 16)
    .attr("dominant-baseline","middle")
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

}
