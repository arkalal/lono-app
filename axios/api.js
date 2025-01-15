import axios from "axios";
import { baseUrlTest } from "./baseUrl";

const instance = axios.create({
  baseURL: `${baseUrlTest}/api/`,
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

export default instance;
