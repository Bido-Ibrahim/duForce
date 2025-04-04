import ForceGraph from "./graph-d3.js";
import VariableTree, { getColorScale } from "./tree";
import { config } from "./config";
import * as d3 from "d3";

const generateParameterData = (dataNodes, dataLinks) => {
  // building nodes and links here
  const nodeIdVar = "NAME";
  const sourceIdVar = "UsesVariable";
  const targetIdVar = "Variable";

  const nodes = dataNodes.reduce((acc, node) => {
    node.id = node[nodeIdVar];
    node.type = "tier3";
    node.subModule = `submodule-${node.SUBMODULE}`
    acc.push(node);
    return acc;
  }, [])

  const links = dataLinks.reduce((acc, link) =>  {
    link.source = link[sourceIdVar];
    link.target = link[targetIdVar];
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS and set direction
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

  return {nodes, links};

}

const dataNullValueCheck = (nodeData, dataType) => {
  nodeData.filter((f) => f[dataType] === null).map((m) => {
    const matching = nodeData.find((f) => f[`${dataType}_NAME`] === m[`${dataType}_NAME`]);
    if(matching){
      m[dataType] = matching[dataType];
    } else {
      console.error(`${JSON.stringify(m)} has missing ${dataType} data`);
    }
  });
  return nodeData.filter((f) => f[dataType] !== null);
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
    config.setInitialLoadComplete(true);
    console.log('call get data')

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
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SUBMODULE");
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SEGMENT");
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

const getGraphData = () => {
  if(config.graphDataType === "parameter") return config.parameterData;
  if(config.graphDataType === "segment") return config.hierarchyData["segment"];
  return config.hierarchyData["submodule"];
}
export const renderGraph = (initial) => {

  const graphData = getGraphData();

  // Execute the function to generate a new network
  ForceGraph(
    graphData,
    {
      containerSelector: "#app",
      initial,
      nodeId: "NAME",
      sourceId: "UsesVariable",
      targetId: "Variable",
      nodeTitle: (d) => d.NAME,
      nodeStroke: "#000",
      linkStroke: "#D0D0D0",
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

