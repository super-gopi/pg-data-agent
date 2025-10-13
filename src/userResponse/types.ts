export interface Component {
  id:string
  name: string;
  type: string;
  description: string;
  props: {
    query?: string;
    [key: string]: any;
  };
  [key: string]: any;
}