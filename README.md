LeetCode problem 

TREE
230. https://leetcode.com/problems/kth-smallest-element-in-a-bst/description/

100. same tree https://leetcode.com/problems/same-tree/

//Gredy Problems

322. Count Change - https://leetcode.com/problems/coin-change/

455. Assign Cookies - https://leetcode.com/problems/assign-cookies/

//Graph

200. Number of Islands - https://leetcode.com/problems/number-of-islands/description/


solve (QN.-1(time and work))

Non-Technical (TSC patter) - https://wayground.com/join

Today Leetcode Problems - 1833. Maximum Ice Cream Bars

Solution - 

int maxIceCream(vector<int>& costs, int coins) {

        sort(costs.begin(), costs.end());

        int n = costs.size();

        if(coins < costs[0]) return 0;

        int ans = 0;

        for(int i=0; i<n; i++){

            if(coins >= costs[i]){

                ans++;

                coins -= costs[i];

            }
            
        }

        return ans;
    }