//geeksforgeeks

class Solution {
  public:
    vector<int> bfs(vector<vector<int>> &adj) {
        // code here
        int n = adj.size();
        int visited[n] = {0};
        visited[0] = 1;
        queue<int> q;
        q.push(0);
        vector<int> ans;
        
        while(!q.empty()){
            int node = q.front();
            q.pop();
            ans.push_back(node);
            
            for(auto it : adj[node]){
                if(visited[it]==0){
                    visited[it] = 1;
                    q.push(it);
                }
            }
        }
        
        return ans;
    }
};