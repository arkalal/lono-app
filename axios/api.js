import axios from "axios";
import { baseUrlStaging, baseUrlTest } from "./baseUrl";

const instance = axios.create({
  baseURL: `${baseUrlStaging}/api/`,
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

export default instance;
