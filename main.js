import ForceGraph from "./graph-pixi.js";
import VariableTree, { getColorScale } from "./tree";
import { config } from "./config";
import * as d3 from "d3";

const generateParameterData = (dataNodes, dataLinks) => {
  // moving this logic to main because
  // only needs to be done once
  // links used in tree.js to generate the hierarchy nodes + links
  const  intern = (value) => value !== null && typeof value === "object" ? value.valueOf() : value;
  // Set up accessors to enable a cleaner way of accessing data attributes

  const N = d3.map(dataNodes, (d) => d["NAME"]).map(intern);
  const LS = d3.map(dataLinks, (d) => d["UsesVariable"]).map(intern);
  const LT = d3.map(dataLinks, (d) => d["Variable"]).map(intern);

  // Replace the input nodes and links with mutable objects for the simulation
  const nodes = d3.map(dataNodes, (d, i) => ({ id: N[i], ...d, type: "tier3" })); // tier3 indicates theses are VARIABLE nodes
  const links = d3.map(dataLinks, (_, i) => ({
    source: LS[i],
    target: LT[i],
  }));


  // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS
  const uniqueLinks = links.reduce((acc, link) =>  {
    if(!acc.some((s) => s.source === link.source && s.target === link.target)){
      const oppositeLink = acc.find((f) => f.source === link.target && f.target === link.source);
      if(oppositeLink){
        oppositeLink.direction = "both";
      } else {
        acc.push(link);
      }
    }
    return acc;
  },[]);


  return {nodes, links: uniqueLinks};

}
async function getData() {
  try {
    // const params = {
    //   method: "GET",
    //   mode: "cors",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // };

    console.log('Base URL:', import.meta.env.BASE_URL);
    console.log('Current URL:', window.location.href);

    //const [response1, response2] = await Promise.all([fetch("/api/nodes", params), fetch("/api/edges", params)]);
    const [response1, response2] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/nodes.json`), fetch(`${import.meta.env.BASE_URL}assets/edges.json`)]);


    if (!response1.ok || !response2.ok) {
      throw new Error(`HTTP error! Status: ${response1.status} ${response2.status}`);
    }

    const resultNodes = await response1.json();
    const resultEdges = await response2.json();

    if (resultNodes && resultEdges) {
      let resultNodesTrunc = resultNodes.map((d) => {
        return {
          NAME: d.NAME,
          DEFINITION: d.DEFINITION,
          SUBMODULE: d.SUBMODULE, // MUST BE A UNIQUE ID
          SUBMODULE_NAME: d["SUBMODULE NAME"], // PREFERABLY A UNIQUE LABEL
          SEGMENT: d.SEGMENT, // MUST BE A UNIQUE ID
          SEGMENT_NAME: d["SEGMENT NAME"], // PREFERABLY A UNIQUE LABEL
          UNITS: d.UNITS,
          ReportValue: d.ReportValue,
          ...d
        };
      });
      config.setInitialLoadComplete(true);
      // data handling - maybe best to do this in main.js?
      // handling data with null SUBMODULE
      resultNodesTrunc.filter((f) => f.SUBMODULE === null).map((m) => {
        const matching = resultNodesTrunc.find((f) => f.SUBMODULE_NAME === m.SUBMODULE_NAME);
        if(matching){
          m.SUBMODULE = matching.SUBMODULE;
        } else {
          console.error(`${JSON.stringify(m)} has missing SUBMODULE data`);
        }
      });
      resultNodesTrunc = resultNodesTrunc.filter((f) => f.SUBMODULE !== null);

      // handling data with null SUBMODULE
      resultNodesTrunc.filter((f) => f.SEGMENT === null).map((m) => {
        const matching = resultNodesTrunc.find((f) => f.SUBMODULE === m.SUBMODULE && m.SEGMENT_NAME === f.SEGMENT_NAME);
        if(matching){
          m.SEGMENT = matching.SEGMENT;
        } else {
          console.error(`${JSON.stringify(m)} has missing SEGMENT data`);
        }
      });
      resultNodesTrunc = resultNodesTrunc.filter((f) => f.SEGMENT !== null);
      // selected node names stored in global array (default all selected)
      config.setSelectedNodeNames(resultNodesTrunc.map((m) => m.NAME));
      // as previously, chart always renders with full dataset (stored here);
      config.parameterData = generateParameterData(resultNodesTrunc,resultEdges);
      // tree is rendered first - renderGraph is called after each tree change
      VariableTree(resultNodesTrunc);

    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

export const renderGraph = (initial) => {

  // Execute the function to generate a new network
  ForceGraph(
    config.parameterData,
    {
      containerSelector: "#app",
      initial,
      nodeId: "NAME",
      sourceId: "UsesVariable",
      targetId: "Variable",
      nodeGroup: (d) => `submodule-${d.SUBMODULE}`,
      nodeTitle: (d) => d.NAME,
      nodeStroke: "#000",
      linkStroke: "#fff",
      labelColor: "#fff",
      width: window.innerWidth,
      height: window.innerHeight,
    }
  );
}
// cheat because main.js was calling twice and didn't want to waste your time debugging at this stage
if(!config.initialLoadComplete){
  getData();
}

