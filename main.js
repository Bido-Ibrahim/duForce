import VariableTree from "./tree";
import { config } from "./config";
import * as d3 from "d3";

// functions used by getData in order - dataNullValueCheck, generateParameterData, getHierarchy, setHierarchyData
const dataNullValueCheck = (nodeData, dataType) => {
  // makes sure that there are matching nodes for segment and submodule names
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

const generateParameterData = (dataNodes, dataLinks) => {
  // building nodes and links here
  const nodeIdVar = "NAME";
  const sourceIdVar = "UsesVariable";
  const targetIdVar = "Variable";
  // add id, type and tier3 nodes to data nodes
  const nodes = dataNodes.reduce((acc, node) => {
    node.id = node[nodeIdVar];
    node.type = "tier3";
    node.subModule = `submodule-${node.SUBMODULE}`;
    node.segment = `segment-${node.SEGMENT}`;
    acc.push(node);
    return acc;
  }, [])

  // filtering out duplicate links and set direction to both if opposite
  const links = dataLinks.reduce((acc, link) =>  {
    link.source = link[sourceIdVar];
    link.target = link[targetIdVar];
    link.direction = "out";
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

const getHierarchy = (nodes) => {

  const ROOT = { id: "ROOT" };
  // slightly re-written from original since data is simpler for chart - same result
  // get + set submodules
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

  // get segments
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

const setHierarchyData = (nodesCopy, resultEdges) => {
  const subModuleNames = new Set();
  const segmentNames = new Set();
  const allLinks = [];

  const getOppositeIds = (leaves) => {
    const parameterSet = leaves.map((m) => m.data.id);
    // filter links to nodes which aren't this submodule
    const matchingLinks = resultEdges.filter((f) => parameterSet.includes(f.source) || parameterSet.includes(f.target)
      && !(parameterSet.includes(f.source) && parameterSet.includes(f.target)))
      .map((m) => m = {id: parameterSet.includes(m.source) ? m.target : m.source, direction: m.direction});
    return [...new Set(matchingLinks.map((m) => m.id))]
      .map((m) => m = {id:m, direction: matchingLinks.some((s) => s.direction === "both") ? "both" : "out"});

  }

  const getOppositeNodes = (oppositeIds) => oppositeIds.reduce((acc, entry) => {
    const matchingNode = config.parameterData.nodes.find((f) => f.id === entry);
    acc.push({
      subModule: matchingNode.subModule,
      segment: matchingNode.segment,
      parameter: matchingNode.id
    })
    return acc;
  },[])

  const addToDirectionGroup = (group, oppositeIdAndDirection) =>  group.forEach((s) => {
    oppositeIdAndDirection.push({
      id: s[0],
      direction: s[1].some((s) => s.direction === "both") ? "both" : "out"
    })
  });

  const getDirection = (linkId, oppositeIdAndDirection) => oppositeIdAndDirection.find((f) => f.id === linkId)?.direction || "none"

  // add extra properties and populate submodule + segment sets
  nodesCopy.descendants()
    .map((m) => {
      m.id = m.data.id;
      m.type = `tier${m.depth}`;
      m.group = m.data.id;
      m.subModule = m.data.subModule;
      if(m.depth === 1){
        m.data.parameterCount = d3.sum(m.children, (s) => s.children.length);
        subModuleNames.add(m.data.id);
        const oppositeIdAndDirection = getOppositeIds(m.leaves());
        const oppositeIds = oppositeIdAndDirection.map((m) => m.id)
            .filter((f) => !config.parameterData.nodes.some((s) => s.id === f && s.subModule === m.data.id));
        const oppositeNodes = getOppositeNodes(oppositeIds);
        const subModuleGroup = Array.from(d3.group(oppositeNodes, (g) => g.subModule));
        const subModuleSet = subModuleGroup.map((m) => m[0]);
        addToDirectionGroup(subModuleGroup,oppositeIdAndDirection);
        const segmentGroup = Array.from(d3.group(oppositeNodes, (g) => g.segment));
        const segmentSet = segmentGroup.map((m) => m[0]);
        addToDirectionGroup(segmentGroup,oppositeIdAndDirection);
        // submodule -> submodule, submodule -> segment, segment -> parameter
        allLinks.push(
          ...[...oppositeIds, ...subModuleSet, ...segmentSet].map(d => ({ source: m.data.id, target: d, direction: getDirection(d,oppositeIdAndDirection) }))
        );
      } else if(m.depth === 2){
        m.data.parameterCount = m.children.length;
        segmentNames.add(m.data.id);
        const oppositeIdAndDirection = getOppositeIds(m.leaves());
        const oppositeIds = oppositeIdAndDirection.map((m) => m.id)
          .filter((f) => !config.parameterData.nodes.some((s) => s.id === f && (s.segment === m.data.id || s.subModule === m.data.subModule)));
        const oppositeNodes = getOppositeNodes(oppositeIds);
        const segmentGroup = Array.from(d3.group(oppositeNodes, (g) => g.segment));
        const segmentSet = segmentGroup.map((m) => m[0]);
        addToDirectionGroup(segmentGroup,oppositeIdAndDirection);
        // segment -> segment, segment -> parameter
        allLinks.push(
          ...[...oppositeIds,  ...segmentSet].map(d => ({ source: m.data.id, target: d, direction: getDirection(d,oppositeIdAndDirection) }))
        );
      } else if (m.depth === 3){
        const oppositeIdAndDirection = getOppositeIds(m.leaves());
        const oppositeIds = oppositeIdAndDirection.map((m) => m.id)
          .filter((f) => !config.parameterData.nodes.some((s) => s.id === f && (s.segment === m.data.id || s.subModule === m.data.subModule)));
        // parameter -> parameter
        allLinks.push(
          ...[...oppositeIds].map(d => ({ source: m.data.id, target: d,direction: getDirection(d,oppositeIdAndDirection)}))
        )
      }
    })
  const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1);
  const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2);
  segmentNodes.map((m) => m.group = m.subModule);
  config.setHierarchyData({subModuleNodes, segmentNodes, allLinks, segmentNames: Array.from(segmentNames), subModuleNames: Array.from(subModuleNames)})

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
      config.setParameterData(generateParameterData(resultNodesTrunc,resultEdges));

      // copy selected node names and set config
      const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));
      config.setAllNodeNames(selectedNodeNamesCopy);

      // get hierarchy from node names
      const treeData = getHierarchy(resultNodesTrunc);
      // mapping submodules and segments to their child nodes (for tree selection)
      config.setTier1And2Mapper(treeData.descendants().filter((f) => f.data.type === "tier3").reduce((acc, entry) => {
        const {subModule, parent, NAME} = entry.data;
        if(!acc[subModule]) {acc[subModule] = []};
        if(!acc[parent]) {acc[parent] = []};
        acc[subModule].push(NAME);
        acc[parent].push(NAME);
        return acc;
      },{}));

      if (window.location.search) {
        String(window.location.search)
          .replace(/\?/g, '')
          .split("&")
          .forEach((param) => {
            const args = param.split("=");
            if(args.length === 2){
              let parameter = args[1];
              if(parameter.includes("~")){
                parameter = parameter.replace(/~/g,'').toUpperCase();
              }
              if(args[0] === "NN" && config.parameterData.nodes.some((s) => s.id === parameter)){
                config.setNearestNeighbourOrigin(parameter);
                config.graphDataType = "parameter";
              }
            }
          });
        const newUrl = window.location.origin + window.location.pathname;
        history.replaceState(null, '', newUrl);
      }

      // copy hierarchy data
      const nodesCopy = treeData.copy();
      // set more config variables
      setHierarchyData(nodesCopy, resultEdges);
      // call the tree
      VariableTree(treeData);
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// cheat because main.js was calling twice and didn't want to waste your time debugging at this stage
if(!config.initialLoadComplete){

  getData();
}
